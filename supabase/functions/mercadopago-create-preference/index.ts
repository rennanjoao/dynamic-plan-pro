/**
 * mercadopago-create-preference
 *
 * Cria (ou reaproveita) uma cobrança interna e devolve o link do Checkout Pro.
 *
 * Segurança:
 * - o valor NUNCA vem do frontend: é lido do catálogo (student_plan_catalog)
 *   ou da própria cobrança em coach_finances;
 * - o chamador precisa ser o aluno dono da cobrança ou o coach responsável;
 * - o access token só existe no servidor (MERCADO_PAGO_ACCESS_TOKEN);
 * - `external_reference` = id da cobrança interna (idempotência no webhook);
 * - nada é marcado como pago aqui — só o webhook confirma.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { addMonths } from "../_shared/mercadopago.ts";

const APP_URL = Deno.env.get("APP_URL") || "https://app.eliteprimehub.com.br";
const MP_API = "https://api.mercadopago.com";

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const accessToken = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!accessToken) {
      return json({ error: "Pagamentos indisponíveis: credencial não configurada." }, 500, cors);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: authData } = await admin.auth.getUser(token);
    const caller = authData?.user;
    if (!caller) return json({ error: "Não autenticado" }, 401, cors);

    const body = await req.json().catch(() => ({}));
    const financeId: string | undefined = body?.finance_id || undefined;
    const planId: string | undefined = body?.plan_id || undefined;
    const studentIdInput: string | undefined = body?.student_id || undefined;

    // ---------------------------------------------------------------- cobrança
    let finance: Record<string, unknown> | null = null;

    if (financeId) {
      const { data } = await admin
        .from("coach_finances")
        .select("*")
        .eq("id", financeId)
        .maybeSingle();
      if (!data) return json({ error: "Cobrança não encontrada" }, 404, cors);
      if (data.student_id !== caller.id && data.coach_id !== caller.id) {
        return json({ error: "Não autorizado" }, 403, cors);
      }
      if (data.status === "paid") return json({ error: "Cobrança já paga" }, 400, cors);
      finance = data;
    } else {
      if (!planId) return json({ error: "Informe plan_id ou finance_id" }, 400, cors);

      const studentId = studentIdInput ?? caller.id;

      // Vínculo aluno/coach nunca vem do client.
      const { data: link } = await admin
        .from("coach_students")
        .select("coach_id")
        .eq("student_id", studentId)
        .eq("status", "active")
        .maybeSingle();
      if (!link) return json({ error: "Aluno sem treinador ativo" }, 400, cors);
      if (studentId !== caller.id && link.coach_id !== caller.id) {
        return json({ error: "Não autorizado" }, 403, cors);
      }
      const coachId: string = link.coach_id;

      // Preço sempre do catálogo oficial.
      const { data: plan } = await admin
        .from("student_plan_catalog")
        .select("*")
        .eq("id", planId)
        .eq("is_active", true)
        .maybeSingle();
      if (!plan) return json({ error: "Plano indisponível" }, 400, cors);
      if (plan.coach_id && plan.coach_id !== coachId) {
        return json({ error: "Plano não pertence ao seu treinador" }, 403, cors);
      }

      // Assinatura vigente (pode não existir na primeira contratação).
      const { data: sub } = await admin
        .from("student_subscriptions")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let subscriptionId = sub?.id ?? null;
      if (!subscriptionId) {
        // Primeira contratação: assinatura PENDENTE, ativada só pelo webhook.
        const today = new Date().toISOString().slice(0, 10);
        const { data: created, error: subErr } = await admin
          .from("student_subscriptions")
          .insert({
            student_id: studentId,
            coach_id: coachId,
            plan_slug: plan.slug,
            plan_name: plan.name,
            price_cents: plan.price_cents,
            cycle_months: plan.duration_months,
            started_on: today,
            next_due_date: addMonths(today, plan.duration_months),
            status: "pending",
            provider: "mercadopago",
          })
          .select("id")
          .single();
        if (subErr) return json({ error: "Falha ao criar assinatura" }, 500, cors);
        subscriptionId = created.id;
      }

      // Regra: no máximo uma cobrança Mercado Pago pendente por aluno.
      await admin
        .from("coach_finances")
        .update({ status: "canceled" })
        .eq("student_id", studentId)
        .eq("status", "pending")
        .eq("provider", "mercadopago");

      const dueDate = new Date().toISOString().slice(0, 10);
      const { data: charge, error: chargeErr } = await admin
        .from("coach_finances")
        .insert({
          coach_id: coachId,
          student_id: studentId,
          description: `Plano ${plan.name}`,
          amount: plan.price_cents / 100,
          amount_cents: plan.price_cents,
          status: "pending",
          due_date: dueDate,
          provider: "mercadopago",
          source: "gateway",
          plan_slug: plan.slug,
          plan_cycle_months: plan.duration_months,
          plan_name_snapshot: plan.name,
          subscription_id: subscriptionId,
        })
        .select("*")
        .single();
      if (chargeErr || !charge) return json({ error: "Falha ao criar cobrança" }, 500, cors);

      await admin
        .from("student_subscriptions")
        .update({ current_charge_id: charge.id })
        .eq("id", subscriptionId);

      finance = charge;
    }

    const amountCents: number =
      (finance!.amount_cents as number | null) ?? Math.round(Number(finance!.amount) * 100);
    if (!amountCents || amountCents <= 0) {
      return json(
        {
          error:
            "Esta cobrança está com valor R$ 0,00. Edite o valor (ou gere uma cobrança de plano) antes de criar o link do Mercado Pago.",
        },
        400,
        cors,
      );
    }


    // ------------------------------------------------------------- preferência
    const notificationUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`;
    const preferenceBody = {
      items: [
        {
          id: String(finance!.id),
          title: String(finance!.plan_name_snapshot || finance!.description || "Mensalidade"),
          quantity: 1,
          currency_id: "BRL",
          unit_price: amountCents / 100,
        },
      ],
      external_reference: String(finance!.id),
      notification_url: notificationUrl,
      back_urls: {
        success: `${APP_URL}/student-area?checkout=retorno`,
        pending: `${APP_URL}/student-area?checkout=pendente`,
        failure: `${APP_URL}/student-area?checkout=falha`,
      },
      auto_return: "approved",
      statement_descriptor: "ELITEHUB",
    };

    const resp = await fetch(`${MP_API}/checkout/preferences`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "X-Idempotency-Key": `pref-${finance!.id}-${amountCents}`,
      },
      body: JSON.stringify(preferenceBody),
    });
    const pref = await resp.json().catch(() => ({}));

    if (!resp.ok || !pref?.init_point) {
      // Nunca ecoa o token nem o corpo bruto da requisição.
      console.error("mercadopago preference failed", resp.status, pref?.message ?? "");
      return json(
        { error: pref?.message || `Mercado Pago retornou ${resp.status}` },
        resp.status >= 400 && resp.status < 500 ? 400 : 502,
        cors,
      );
    }

    await admin
      .from("coach_finances")
      .update({
        checkout_url: pref.init_point,
        checkout_created_at: new Date().toISOString(),
        mercado_pago_preference_id: pref.id ?? null,
        mercado_pago_status: "pending",
        provider: "mercadopago",
      })
      .eq("id", finance!.id);

    return json({ url: pref.init_point, finance_id: finance!.id, preference_id: pref.id }, 200, cors);
  } catch (e) {
    console.error("create-preference error", e instanceof Error ? e.message : e);
    return json({ error: "Erro ao criar checkout" }, 500, cors);
  }
});
