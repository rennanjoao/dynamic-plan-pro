import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

import { buildCorsHeaders } from "../_shared/cors.ts";

/** Escapa caracteres HTML perigosos em strings fornecidas pelo usuário */
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── [FIX CRÍTICO] Verificar autenticação antes de qualquer outra coisa ──
    // Sem este bloco, qualquer pessoa na internet podia enviar e-mails pelo
    // domínio eliteprimehub.com.br sem nenhum acesso ao sistema.
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Somente coaches e admins podem enviar planos por e-mail
    const { data: isCoach } = await userClient.rpc("has_role", {
      _user_id: user.id, _role: "coach",
    });
    const { data: isAdmin } = await userClient.rpc("has_role", {
      _user_id: user.id, _role: "admin",
    });
    if (!isCoach && !isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // ── fim do bloco de autenticação ──

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY não configurada");
    }

    const resend = new Resend(RESEND_API_KEY);
    const { toEmail, studentName, htmlContent, subject, customMessage } = await req.json();

    if (!toEmail || !studentName || !htmlContent) {
      return new Response(
        JSON.stringify({ error: "Email, nome do aluno e conteúdo HTML são obrigatórios" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const emailSubject = subject || `Seu Plano de Treino Personalizado - ${studentName}`;

    // [FIX CRÍTICO] customMessage escapado para evitar injeção de HTML malicioso
    const messagePrefix = customMessage
      ? `<div style="padding: 20px; background: #f5f5f5; border-radius: 8px; margin-bottom: 20px;">
           <p style="white-space: pre-wrap; font-family: Arial, sans-serif; line-height: 1.6;">${escapeHtml(customMessage)}</p>
         </div>`
      : "";

    const fullHtmlContent = `
      ${messagePrefix}
      ${htmlContent}
    `;

    console.log(`Enviando plano de treino para: ${toEmail}`);

    const emailResponse = await resend.emails.send({
      from: "Elite Prime Hub <noreply@eliteprimehub.com.br>",
      to: [toEmail],
      subject: emailSubject,
      html: fullHtmlContent,
    });

    console.log("Email enviado com sucesso:", emailResponse);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email enviado com sucesso!",
        response: emailResponse
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro ao enviar email";
    console.error("Erro ao enviar email:", error);
    return new Response(
      JSON.stringify({ error: msg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
