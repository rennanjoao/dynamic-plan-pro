// Callback da InfinityPay: confirma o pagamento e marca a cobrança como paga.
// Responde 200 rápido — a InfinityPay reenvia em caso de erro.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const body = await req.json().catch(() => ({}));
    const orderNsu: string | undefined = body?.order_nsu ?? body?.orderNsu;
    const captureMethod: string | undefined = body?.capture_method ?? body?.captureMethod;
    if (!orderNsu) {
      return new Response(JSON.stringify({ ok: true, ignored: "sem order_nsu" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: finance } = await admin
      .from("coach_finances").select("id, status").eq("id", orderNsu).maybeSingle();
    if (finance && finance.status !== "paid") {
      await admin.from("coach_finances").update({
        status: "paid",
        payment_method: captureMethod === "credit_card" ? "cartao" : "pix_infinitepay",
        paid_at: new Date().toISOString(),
      }).eq("id", finance.id);
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
