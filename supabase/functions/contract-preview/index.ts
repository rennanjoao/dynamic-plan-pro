// Contrato na anamnese: dados públicos do coach e tabela de planos, para o
// visitante ler o contrato ANTES de criar a conta.
// Rota pública (chamada antes do login), com limite de 15 tentativas/minuto por
// IP, como validate-invite-code. Não expõe e-mail; CPF de coach pessoa física
// vai mascarado (CNPJ é dado público e vai completo).
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

function maskCpf(d: string): string {
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const coachId = typeof body.coachId === "string" ? body.coachId : "";
    if (!/^[0-9a-f-]{36}$/i.test(coachId)) return json({ error: "Treinador inválido." }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const ip = (req.headers.get("x-forwarded-for") ?? "unknown").split(",")[0].trim();
    const { data: allowed, error: rateErr } = await admin.rpc("check_rate_limit", {
      _bucket: `contract-preview:${ip}`,
      _max_hits: 15,
      _window_seconds: 60,
    });
    if (!rateErr && allowed === false) return json({ error: "Muitas tentativas. Aguarde um minuto." }, 429);

    // Só coach de verdade.
    const { data: role } = await admin.from("user_roles").select("role").eq("user_id", coachId).eq("role", "coach").maybeSingle();
    if (!role) return json({ error: "Treinador não encontrado." }, 404);

    const [profile, settings, plans] = await Promise.all([
      admin.from("profiles").select("full_name, team_name, cref, support_whatsapp").eq("user_id", coachId).maybeSingle(),
      admin.from("coach_contract_settings").select("document, company_name, instagram").eq("coach_id", coachId).maybeSingle(),
      admin.from("student_plan_catalog")
        .select("slug, name, price_cents, duration_months")
        .eq("coach_id", coachId)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);

    const doc = String(settings.data?.document ?? "").replace(/\D/g, "");
    return json({
      party: {
        coach_id: coachId,
        name: (profile.data?.full_name ?? "").trim() || "Treinador",
        team_name: profile.data?.team_name ?? null,
        cref: profile.data?.cref ?? null,
        document: doc.length === 14 ? doc : null,
        document_masked: doc.length === 11 ? maskCpf(doc) : null,
        company_name: settings.data?.company_name ?? null,
        instagram: settings.data?.instagram ?? null,
        whatsapp: profile.data?.support_whatsapp ?? null,
      },
      catalog: plans.data ?? [],
    });
  } catch (e) {
    console.warn("[contract-preview]", e instanceof Error ? e.message : e);
    return json({ error: "Erro ao carregar o contrato." }, 500);
  }
});
