import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
    const messagePrefix = customMessage 
      ? `<div style="padding: 20px; background: #f5f5f5; border-radius: 8px; margin-bottom: 20px;">
           <p style="white-space: pre-wrap; font-family: Arial, sans-serif; line-height: 1.6;">${customMessage}</p>
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
  } catch (error: any) {
    console.error("Erro ao enviar email:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message || "Erro ao enviar email" 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
