// supabase/functions/_shared/checkinCopy.ts
// Copy do motor de e-mails transacionais de check-in (D-1 / D-0 / D+2).
// Cada variação é escolhida aleatoriamente para não soar robótico ao
// aluno que recebe o mesmo tipo de e-mail a cada ciclo de feedback.
// Tom: técnico e direto — sem hype vazio, sem emoji em excesso.

export type EmailType = "d1" | "d0" | "d2";

interface CopyVariant {
  subject: string;
  heading: string;
  body: string;
}

/** D-1 — Aviso Prévio. Foco: olhar para dentro (sono, apetite, energia). */
const D1_VARIANTS: CopyVariant[] = [
  {
    subject: "Amanhã é dia de feedback: comece a observar agora",
    heading: "Amanhã é dia de feedback",
    body:
      "Antes do seu feedback amanhã, vale prestar atenção em três sinais que o treino sozinho não mostra: qualidade do sono, apetite e nível de energia nos últimos dias. Esses dados guiam ajustes cirúrgicos no seu protocolo — sem eles, o ajuste vira achismo.",
  },
  {
    subject: "D-1: o que seu corpo está te dizendo esta semana?",
    heading: "Faltam 24h para o seu feedback",
    body:
      "Repare em como está dormindo, na sua fome ao longo do dia e na sua disposição nos treinos. Chegar amanhã com essas observações prontas transforma o feedback em ajuste de precisão, não em suposição.",
  },
  {
    subject: "Antes de amanhã: 3 sinais que valem sua atenção",
    heading: "3 sinais para observar hoje",
    body:
      "Sono, apetite e energia contam uma história que o espelho não conta. Observe esses três pontos hoje — amanhã, ao preencher seu feedback, essas percepções permitem um ajuste cirúrgico no seu plano em vez de um chute.",
  },
  {
    subject: "Feedback amanhã: a precisão começa hoje",
    heading: "A precisão do seu ajuste começa hoje",
    body:
      "O feedback de amanhã só é tão bom quanto as informações que você traz. Hoje é o dia de reparar em sono, apetite e energia — são exatamente esses três sinais que permitem calibrar seu protocolo com cirurgia, não com tentativa e erro.",
  },
];

/** D-0 — Dia do Feedback. Foco: leva poucos minutos, seu progresso depende disso. */
const D0_VARIANTS: CopyVariant[] = [
  {
    subject: "Hoje é dia de feedback — leva menos de 5 minutos",
    heading: "Hoje é dia de feedback",
    body:
      "Seu feedback de hoje leva poucos minutos para ser preenchido, mas é a base de todo ajuste do seu plano nas próximas semanas. Sem ele, seu progresso literalmente para de ser acompanhado.",
  },
  {
    subject: "Seu progresso depende do feedback de hoje",
    heading: "Seu progresso depende deste feedback",
    body:
      "Sem o feedback de hoje, não há como calibrar carga, dieta ou frequência. Reserve poucos minutos agora — é o que mantém seu plano alinhado ao que está funcionando (ou não) no seu corpo.",
  },
  {
    subject: "5 minutos hoje. Ajuste preciso na próxima semana.",
    heading: "5 minutos hoje, ajuste preciso depois",
    body:
      "Hoje é o dia do seu feedback. É rápido — poucos minutos — mas é o único jeito do seu coach saber se o plano atual está funcionando. Seu progresso depende diretamente dessa atualização.",
  },
  {
    subject: "Está pendente: seu feedback de hoje",
    heading: "Seu feedback de hoje está pendente",
    body:
      "O feedback de hoje ainda não foi enviado. Leva poucos minutos e é a informação que decide os próximos ajustes do seu protocolo. Sem essa etapa, seu progresso fica parado no radar do coach.",
  },
];

/** D+2 — Repescagem. Gatilho de urgência: plano ajustado no escuro. */
const D2_VARIANTS: CopyVariant[] = [
  {
    subject: "Atenção: seu plano será ajustado às cegas",
    heading: "Seu plano será ajustado às cegas",
    body:
      "Já se passaram dois dias desde que seu feedback venceu. Sem essa informação, qualquer ajuste no seu plano é feito no escuro — e isso pode desperdiçar o esforço que você colocou nos últimos treinos. Envie agora para retomar o controle.",
  },
  {
    subject: "Sem seu feedback, seu esforço pode estar sendo desperdiçado",
    heading: "Seu esforço pode estar sendo desperdiçado",
    body:
      "Dois dias de atraso no feedback significam dois dias em que seu coach não sabe o que realmente está acontecendo com seu corpo. Seu plano será ajustado no escuro se isso continuar — não deixe o esforço dos últimos treinos perder efeito.",
  },
  {
    subject: "Última chamada: feedback pendente há 2 dias",
    heading: "Última chamada — feedback pendente",
    body:
      "Seu feedback está pendente há dois dias. A partir daqui, qualquer ajuste no seu protocolo passa a ser um chute, não uma decisão baseada em dado real. Envie agora antes que o próximo ciclo comece sem essa informação.",
  },
  {
    subject: "Seu coach está no escuro sobre sua evolução",
    heading: "Seu coach está no escuro sobre sua evolução",
    body:
      "Há dois dias sem feedback, seu coach está tomando decisões sobre seu plano sem visibilidade real do que está acontecendo. Não deixe o esforço do seu treino ser desperdiçado por falta de uma atualização de poucos minutos.",
  },
];

const POOLS: Record<EmailType, CopyVariant[]> = {
  d1: D1_VARIANTS,
  d0: D0_VARIANTS,
  d2: D2_VARIANTS,
};

const BADGE: Record<EmailType, { label: string; accent: string }> = {
  d1: { label: "Aviso Prévio", accent: "#0EA5E9" },
  d0: { label: "Dia do Feedback", accent: "#10B981" },
  d2: { label: "Feedback Pendente", accent: "#B11226" },
};

const CTA_LABEL: Record<EmailType, string> = {
  d1: "Ver meu histórico",
  d0: "Enviar feedback agora",
  d2: "Enviar feedback agora",
};

function esc(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export interface BuildCheckinEmailParams {
  studentName: string;
  coachName: string;
  ctaUrl: string;
}

export interface BuiltCheckinEmail {
  subject: string;
  html: string;
  variantIndex: number;
}

/**
 * Monta o e-mail (assunto + HTML) para o tipo informado, escolhendo
 * aleatoriamente uma das variações de copy do pool correspondente.
 */
export function buildCheckinEmailHtml(
  type: EmailType,
  params: BuildCheckinEmailParams
): BuiltCheckinEmail {
  const pool = POOLS[type];
  const variantIndex = Math.floor(Math.random() * pool.length);
  const variant = pool[variantIndex];
  const badge = BADGE[type];
  const ctaLabel = CTA_LABEL[type];

  const html = `
<div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;background:#0a0a0a;border-radius:16px;overflow:hidden;border:1px solid #2a2a2a;">
  <div style="padding:22px 28px;border-bottom:1px solid #2a2a2a;">
    <p style="margin:0;color:#C5A059;font-size:11px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;">Elite Prime Hub</p>
    <span style="display:inline-block;margin-top:12px;padding:5px 12px;border-radius:999px;background:${badge.accent}22;border:1px solid ${badge.accent}88;color:${badge.accent};font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;">${esc(badge.label)}</span>
  </div>
  <div style="padding:28px;color:#e5e5e5;">
    <p style="margin:0 0 6px 0;font-size:13px;color:#9a9a9a;">Olá, ${esc(params.studentName)}.</p>
    <h1 style="margin:0 0 14px 0;color:#fff;font-size:20px;font-weight:800;line-height:1.3;">${esc(variant.heading)}</h1>
    <p style="margin:0 0 24px 0;font-size:14px;line-height:1.7;color:#c9c9c9;">${esc(variant.body)}</p>
    <a href="${params.ctaUrl}" style="display:inline-block;padding:12px 24px;border-radius:10px;background:#C5A059;color:#080808;font-size:13px;font-weight:800;text-decoration:none;letter-spacing:.02em;">${esc(ctaLabel)}</a>
  </div>
  <div style="padding:16px 28px;border-top:1px solid #2a2a2a;">
    <p style="margin:0;color:#666;font-size:11px;">Coach ${esc(params.coachName)} · Elite Prime Hub</p>
  </div>
</div>`.trim();

  return { subject: variant.subject, html, variantIndex };
}