import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import {
  AESTHETIC_SYSTEM_PROMPT, POSE_ORDER, POSTURE_SYSTEM_PROMPT,
  parseAesthetic, parsePosture, photosFingerprint, planAnalysis,
  type AestheticResult, type ExistingAnalysis, type PostureResult,
} from "../_shared/photoAnalysisLogic.ts";
import { groqChat, groqErrorMessage } from "../_shared/groq.ts";

/**
 * Análise das fotos do check-in (para o coach; a aluna não lê o resultado).
 *
 * Body: { checkInId, parts?: ("estetica" | "postura")[] } — sem `parts`, gera
 * as duas. Gera só o que falta (ou tudo de novo, se a aluna trocou as fotos).
 *
 * Revisão de precisão (pacote 6):
 *  - referência da estética = check-in ANTERIOR ao analisado (antes podia pegar
 *    um check-in mais novo ao analisar um antigo);
 *  - resposta inválida da IA não é gravada (antes ficava vazia para sempre);
 *  - 1 nova tentativa quando a IA devolve algo fora do formato;
 *  - trocar as fotos refaz a análise (impressão digital das 4 fotos);
 *  - coach só com vínculo ATIVO pode pedir;
 *  - postura numa chamada separada, com as 4 fotos e prompt próprio.
 */

// O modelo aceita no máximo 5 imagens por chamada: estética usa até 4 (2 atuais
// + 2 de referência) e postura usa as 4 atuais — chamadas separadas.
const COMPARE_POSES = ["frente", "costas"] as const;
type Content = Array<Record<string, unknown>>;

/** Erro do provedor (chave, cota, modelo) — a mensagem já vem em português. */
class GroqCallError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function callModel(apiKey: string, system: string, content: Content, temperature: number): Promise<string> {
  // Modelo com visão: o plano B de texto (sem imagem) não é usado aqui.
  const { response: aiRes } = await groqChat({
    apiKey,
    label: "photo-analysis",
    vision: true,
    body: {
      messages: [
        { role: "system", content: system },
        { role: "user", content },
      ],
      stream: false,
      temperature,
      reasoning_effort: "none",
    },
  });
  if (!aiRes.ok) {
    const t = await aiRes.text().catch(() => "");
    console.error("[photo-analysis] Groq", aiRes.status, t);
    throw new GroqCallError(aiRes.status, groqErrorMessage(aiRes.status, t));
  }
  const aiJson = await aiRes.json();
  return aiJson.choices?.[0]?.message?.content ?? "";
}

/** Chama e valida; se vier fora do formato, tenta mais uma vez mais "fria". */
async function callValidated<T>(
  apiKey: string, system: string, content: Content, parse: (raw: string) => T | null, label: string,
): Promise<T | null> {
  for (const temperature of [0.2, 0]) {
    const raw = await callModel(apiKey, system, content, temperature);
    const parsed = parse(raw);
    if (parsed) return parsed;
    console.warn(`[photo-analysis] ${label}: resposta fora do formato (temp ${temperature}):`, raw.slice(0, 500));
  }
  return null;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY_EVAL");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY_EVAL is not configured");

    const authHeader = req.headers.get("Authorization");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Não autenticado");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json().catch(() => ({}));
    const checkInId = body?.checkInId;
    if (!checkInId) throw new Error("checkInId é obrigatório");
    const parts: string[] = Array.isArray(body?.parts) && body.parts.length > 0 ? body.parts : ["estetica", "postura"];

    const { data: current, error: curErr } = await adminClient
      .from("check_ins")
      .select("id, student_id, payload, submitted_at")
      .eq("id", checkInId)
      .maybeSingle();
    if (curErr) throw curErr;
    if (!current) throw new Error("Check-in não encontrado");

    const [{ data: isAdmin }, { data: isCoachRole }] = await Promise.all([
      adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" }),
      adminClient.rpc("has_role", { _user_id: user.id, _role: "coach" }),
    ]);
    let allowed = user.id === current.student_id || !!isAdmin;
    if (!allowed && isCoachRole) {
      const { data: link } = await adminClient
        .from("coach_students")
        .select("coach_id")
        .eq("student_id", current.student_id)
        .eq("coach_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      allowed = !!link;
    }
    if (!allowed) throw new Error("Acesso negado");

    const payload = (current.payload as Record<string, unknown>) || {};
    const fotos = (payload.fotos as Record<string, string>) || {};
    if (POSE_ORDER.some((k) => !fotos[k])) return json({ ok: true, skipped: "fotos_incompletas" });
    const fingerprint = photosFingerprint(fotos);

    // Colunas novas (posture/photos_fingerprint) só existem depois do SQL do
    // pacote 6. Sem elas, funciona como antes (só a parte estética).
    let postureSupported = true;
    let existing: ExistingAnalysis | null = null;
    {
      const res = await adminClient
        .from("checkin_photo_analysis")
        .select("tags, posture, photos_fingerprint")
        .eq("check_in_id", checkInId)
        .maybeSingle();
      if (res.error) {
        if (res.error.code !== "42703") throw res.error;
        postureSupported = false;
        const legacy = await adminClient
          .from("checkin_photo_analysis")
          .select("tags")
          .eq("check_in_id", checkInId)
          .maybeSingle();
        if (legacy.error) throw legacy.error;
        existing = legacy.data ? { tags: legacy.data.tags, posture: null, photos_fingerprint: null } : null;
      } else if (res.data) {
        existing = res.data as ExistingAnalysis;
      }
    }

    const plan = planAnalysis({
      existing,
      fingerprint,
      wantAesthetic: parts.includes("estetica"),
      wantPosture: parts.includes("postura"),
      postureSupported,
    });
    if (!plan.aesthetic && !plan.posture) {
      return json({
        ok: true,
        skipped: "already_generated",
        posture: postureSupported ? "mantida" : "indisponivel",
      });
    }

    // Fotos no bucket PRIVADO `student-media`: o modelo recebe URL assinada
    // temporária. Valores legados (http) passam direto.
    const signMedia = async (ref: string | null): Promise<string | null> => {
      if (!ref) return null;
      if (/^https?:/i.test(ref)) return ref;
      const { data } = await adminClient.storage.from("student-media").createSignedUrl(ref, 900);
      return data?.signedUrl ?? null;
    };

    let aiError: string | null = null;
    let aesthetic: AestheticResult | null = null;
    let aestheticStatus: "gerada" | "falhou" | "nao_pedida" = "nao_pedida";
    let posture: PostureResult | null = null;
    let postureStatus: "gerada" | "falhou" | "nao_pedida" | "indisponivel" =
      postureSupported ? "nao_pedida" : "indisponivel";

    // ── 1) Estética (comparação com o check-in ANTERIOR) ─────────────────────
    if (plan.aesthetic) {
      const { data: prevList } = await adminClient
        .from("check_ins")
        .select("id, payload, submitted_at")
        .eq("student_id", current.student_id)
        .neq("id", checkInId)
        .lt("submitted_at", current.submitted_at)
        .order("submitted_at", { ascending: false })
        .limit(10);

      let refFrente: string | null = null;
      let refCostas: string | null = null;
      for (const p of prevList ?? []) {
        const pf = ((p.payload as Record<string, unknown>)?.fotos as Record<string, string>) || {};
        if (COMPARE_POSES.every((k) => pf[k])) {
          refFrente = pf.frente;
          refCostas = pf.costas;
          break;
        }
      }

      const [frenteUrl, costasUrl, refFrenteUrl, refCostasUrl] = await Promise.all([
        signMedia(fotos.frente), signMedia(fotos.costas), signMedia(refFrente), signMedia(refCostas),
      ]);
      if (!frenteUrl || !costasUrl) return json({ ok: true, skipped: "fotos_inacessiveis" });
      const useReference = !!refFrenteUrl && !!refCostasUrl;

      // Contexto de objetivo/condição do aluno (resumo já usado no coach — nunca cru)
      const { data: anamneseRow } = await adminClient
        .from("anamnesis")
        .select("ai_summary")
        .eq("student_id", current.student_id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const anamneseContexto = anamneseRow?.ai_summary ?? null;

      const content: Content = [
        {
          type: "text",
          text: `Comparação em pares por pose (frente com frente, costas com costas).${useReference ? "" : " Sem par anterior completo (frente+costas) — analise só as fotos atuais."}${anamneseContexto ? `\n\nContexto do aluno (objetivo/condição, da anamnese): ${anamneseContexto}` : ""}`,
        },
        { type: "text", text: "Frente atual:" },
        { type: "image_url", image_url: { url: frenteUrl } },
      ];
      if (useReference) {
        content.push({ type: "text", text: "Frente anterior (referência):" });
        content.push({ type: "image_url", image_url: { url: refFrenteUrl! } });
      }
      content.push({ type: "text", text: "Costas atual:" });
      content.push({ type: "image_url", image_url: { url: costasUrl } });
      if (useReference) {
        content.push({ type: "text", text: "Costas anterior (referência):" });
        content.push({ type: "image_url", image_url: { url: refCostasUrl! } });
      }

      try {
        aesthetic = await callValidated(GROQ_API_KEY, AESTHETIC_SYSTEM_PROMPT, content, (raw) => parseAesthetic(raw, useReference), "estetica");
      } catch (err) {
        // Falha de rede/IA numa parte não derruba a outra.
        console.error("[photo-analysis] estetica:", err);
        if (err instanceof GroqCallError) aiError = err.message;
      }
      aestheticStatus = aesthetic ? "gerada" : "falhou";
    }

    // ── 2) Postura (as 4 fotos atuais) ───────────────────────────────────────
    if (plan.posture) {
      const urls = await Promise.all(POSE_ORDER.map((k) => signMedia(fotos[k])));
      if (urls.some((u) => !u)) {
        postureStatus = "falhou";
      } else {
        const labels: Record<string, string> = {
          frente: "Foto de FRENTE:",
          lateral_dir: "Foto de LADO (lado direito do corpo virado para a câmera):",
          lateral_esq: "Foto de LADO (lado esquerdo do corpo virado para a câmera):",
          costas: "Foto de COSTAS:",
        };
        const content: Content = [{ type: "text", text: "Triagem visual das 4 fotos abaixo." }];
        POSE_ORDER.forEach((k, i) => {
          content.push({ type: "text", text: labels[k] });
          content.push({ type: "image_url", image_url: { url: urls[i]! } });
        });
        try {
          posture = await callValidated(GROQ_API_KEY, POSTURE_SYSTEM_PROMPT, content, parsePosture, "postura");
        } catch (err) {
          console.error("[photo-analysis] postura:", err);
          if (err instanceof GroqCallError) aiError = err.message;
        }
        postureStatus = posture ? "gerada" : "falhou";
      }
    }

    if (!aesthetic && !posture) {
      // Nada aproveitável: não grava nada, assim uma próxima chamada tenta de novo.
      return json({
        ok: false,
        error: aiError ?? "A IA não devolveu uma análise válida das fotos. Tente de novo.",
        code: aiError ? "ia_indisponivel" : "ia_invalida",
        estetica: aestheticStatus,
        posture: postureStatus,
      }, 502);
    }

    const nowIso = new Date().toISOString();
    const photosChanged = !!existing?.photos_fingerprint && existing.photos_fingerprint !== fingerprint;
    const row: Record<string, unknown> = { check_in_id: checkInId };
    if (aesthetic) {
      row.tags = aesthetic.tags;
      row.reliability = aesthetic.reliability;
      row.generated_at = nowIso;
    } else if (!existing || photosChanged) {
      // Fotos novas e a estética falhou: não deixa a leitura das fotos antigas valendo.
      row.tags = {};
      row.reliability = null;
    }
    if (postureSupported) {
      if (posture) {
        row.posture = posture;
        row.posture_generated_at = nowIso;
      } else if (photosChanged) {
        row.posture = null;
        row.posture_generated_at = null;
      }
      row.photos_fingerprint = fingerprint;
    }

    const { error: upsertErr } = await adminClient
      .from("checkin_photo_analysis")
      .upsert(row, { onConflict: "check_in_id" });
    if (upsertErr) throw upsertErr;

    return json({ ok: true, estetica: aestheticStatus, posture: postureStatus });
  } catch (e) {
    console.error("[photo-analysis]", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
