/** Texto e link do convite de aluno (InviteStudentDialog). */

export function buildInviteLink(origin: string, code: string): string {
  return `${origin.replace(/\/$/, "")}/anamnesis?codigo=${encodeURIComponent(code)}`;
}

export function buildInviteMessage(opts: { studentName?: string; coachName?: string; link: string; code: string }): string {
  const first = (opts.studentName ?? "").trim().split(/\s+/)[0];
  const hello = first ? `Oi, ${first}!` : "Oi!";
  const from = opts.coachName ? ` com ${opts.coachName}` : "";
  return [
    `${hello} Seu acesso ao app de acompanhamento${from} está pronto.`,
    ``,
    `1) Abra este link: ${opts.link}`,
    `2) Confirme o código ${opts.code} e preencha sua avaliação (dá para parar e continuar depois).`,
    ``,
    `Qualquer dúvida, é só me chamar.`,
  ].join("\n");
}

/** Número para wa.me: só dígitos, com 55 quando vier sem DDI. Vazio → sem número. */
export function normalizeWhatsapp(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return digits.length <= 11 ? `55${digits}` : digits;
}
