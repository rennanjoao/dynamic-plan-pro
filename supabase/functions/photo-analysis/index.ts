import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const POSE_ORDER = ["frente", "lateral_dir", "lateral_esq", "costas"] as const;
// Envio pra IA é só o par frente+costas (limite de 5 imagens/request do modelo).
// POSE_ORDER continua sendo o gate de "check-in tem as 4 fotos" — não muda.
const COMPARE_POSES = ["frente", "costas"] as const;

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const authHeader = req.headers.get("Authorization");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Não autenticado");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { checkInId } = await req.json();
    if (!checkInId) throw new Error("checkInId é obrigatório");

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
        .maybeSingle();
      allowed = !!link;
    }
    if (!allowed) throw new Error("Acesso negado");

    // Idempotência estrita: nunca reprocessa
    const { data: existing } = await adminClient
      .from("checkin_photo_analysis")
      .select("id")
      .eq("check_in_id", checkInId)
      .maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ ok: true, skipped: "already_generated" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = (current.payload as Record<string, unknown>) || {};
    const fotos = (payload.fotos as Record<string, string>) || {};
    const missing = POSE_ORDER.some((k) => !fotos[k]);
    if (missing) {
      return new Response(JSON.stringify({ ok: true, skipped: "fotos_incompletas" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Referência: check-in anterior mais recente com o par frente+costas completo
    const { data: prevList } = await adminClient
      .from("check_ins")
      .select("id, payload, submitted_at")
      .eq("student_id", current.student_id)
      .neq("id", checkInId)
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
    const hasReference = !!refFrente && !!refCostas;

    // Fotos agora ficam no bucket PRIVADO `student-media`: o modelo precisa de
    // URL assinada temporária. Valores legados (http) passam direto.
    const signMedia = async (ref: string | null): Promise<string | null> => {
      if (!ref) return null;
      if (/^https?:/i.test(ref)) return ref;
      const { data } = await adminClient.storage
        .from("student-media")
        .createSignedUrl(ref, 900);
      return data?.signedUrl ?? null;
    };
    const [frenteUrl, costasUrl, refFrenteUrl, refCostasUrl] = await Promise.all([
      signMedia(fotos.frente),
      signMedia(fotos.costas),
      signMedia(refFrente),
      signMedia(refCostas),
    ]);
    if (!frenteUrl || !costasUrl) {
      return new Response(JSON.stringify({ ok: true, skipped: "fotos_inacessiveis" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const useReference = hasReference && !!refFrenteUrl && !!refCostasUrl;

    // Contexto de objetivo/condição do aluno (mesmo resumo já usado no coach — nunca cru)
    const { data: anamneseRow } = await adminClient
      .from("anamnesis")
      .select("ai_summary")
      .eq("student_id", current.student_id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const anamneseContexto = anamneseRow?.ai_summary ?? null;

    const SYSTEM_PROMPT = `Você analisa fotos corporais (frente e costas) de um aluno de fitness para o coach dele.
Responda SOMENTE com um JSON válido, sem markdown, sem texto fora do JSON, exatamente neste formato:
{"gordura_visual":"...","definicao":"...","volume_muscular":"...","simetria":"...","reliability":0.0}
- Descrições curtas e qualitativas (ex.: "moderada", "boa definição no tronco", "levemente assimétrico à direita").
- As imagens vêm identificadas por legenda (frente atual, frente anterior, costas atual, costas anterior). Compare cada pose com seu par da mesma pose quando o par anterior existir.
- "simetria" pode considerar frente e costas atuais entre si, mesmo sem referência anterior.
- Use o contexto de objetivo/condição do aluno (se fornecido) só para calibrar a leitura (ex.: fase de volume explica menos definição; não tratar como meta a cobrar do aluno).
- NUNCA cite peso, %BF ou qualquer número clínico.
- NUNCA emita diagnóstico clínico, mesmo que o contexto mencione lesão ou condição de saúde.
- reliability: 0.0 a 1.0 conforme a confiabilidade da comparação com as fotos de referência anterior (frente+costas). Se não houver esse par anterior completo, use 0.`;

    const userContent: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `Comparação em pares por pose (frente com frente, costas com costas).${useReference ? "" : " Sem par anterior completo (frente+costas) — analise só as fotos atuais."}${anamneseContexto ? `\n\nContexto do aluno (objetivo/condição, da anamnese): ${anamneseContexto}` : ""}`,
      },
      { type: "text", text: "Frente atual:" },
      { type: "image_url", image_url: { url: frenteUrl } },
    ];
    if (useReference) {
      userContent.push({ type: "text", text: "Frente anterior (referência):" });
      userContent.push({ type: "image_url", image_url: { url: refFrenteUrl! } });
    }
    userContent.push({ type: "text", text: "Costas atual:" });
    userContent.push({ type: "image_url", image_url: { url: costasUrl } });
    if (useReference) {
      userContent.push({ type: "text", text: "Costas anterior (referência):" });
      userContent.push({ type: "image_url", image_url: { url: refCostasUrl! } });
    }

    const aiRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "qwen/qwen3.6-27b",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userContent },
        ],
        stream: false,
        temperature: 0.3,
        reasoning_effort: "none",
      }),
    });
    if (!aiRes.ok) {
      const t = await aiRes.text().catch(() => "");
      throw new Error(`Groq error ${aiRes.status}: ${t}`);
    }
    const aiJson = await aiRes.json();
    const raw = aiJson.choices?.[0]?.message?.content ?? "{}";
    let parsed: {
      gordura_visual?: string;
      definicao?: string;
      volume_muscular?: string;
      simetria?: string;
      reliability?: number;
    };
    try {
      parsed = JSON.parse(raw.replace(/```json|```/g, "").trim());
    } catch {
      console.error("[photo-analysis] resposta não-JSON do modelo:", raw);
      parsed = {};
    }

    const tags = {
      gordura_visual: parsed.gordura_visual ?? "",
      definicao: parsed.definicao ?? "",
      volume_muscular: parsed.volume_muscular ?? "",
      simetria: parsed.simetria ?? "",
    };
    const reliability =
      typeof parsed.reliability === "number" && isFinite(parsed.reliability)
        ? Math.max(0, Math.min(1, parsed.reliability))
        : (useReference ? null : 0);

    const { error: upsertErr } = await adminClient
      .from("checkin_photo_analysis")
      .upsert(
        {
          check_in_id: checkInId,
          tags,
          reliability,
          generated_at: new Date().toISOString(),
        },
        { onConflict: "check_in_id" }
      );
    if (upsertErr) throw upsertErr;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[photo-analysis]", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }), {
      status: 500,
      headers: { ...buildCorsHeaders(req.headers.get("origin")), "Content-Type": "application/json" },
    });
  }
});
