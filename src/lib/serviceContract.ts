// Contrato de prestação de serviços (aluno ↔ coach), aceito no app.
// Uma fonte só: o mesmo texto é mostrado ao aluno e gravado no aceite.
// Valores e descontos vêm do catálogo de planos do coach.
import { sb } from "@/integrations/supabase/untyped";
import { formatCents } from "@/lib/studentPlans";
import { formatBirthDate } from "@/lib/age";

/** Mudou o texto? Troque a versão: quem já aceitou a anterior aceita de novo. */
export const CONTRACT_VERSION = "2026-11-27";

/** CNPJ da Elite Prime Hub (dona da plataforma e prestadora da consultoria do Rennan). */
export const PLATFORM_CNPJ = "68650322000110";
export const PLATFORM_NAME = "Elite Prime Hub";

export interface ContractParty {
  coach_id: string;
  name: string;
  team_name?: string | null;
  cref?: string | null;
  document?: string | null;
  /** CPF mascarado (rota pública do cadastro), ex.: ***.982.247-**. */
  document_masked?: string | null;
  company_name?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  /** Código de parceria com que o aluno entrou (se entrou por um). */
  partner_code?: string | null;
}

export interface CatalogPlanLike {
  slug: string;
  name: string;
  price_cents: number;
  duration_months: number;
}

export interface PlanPricing {
  planSlug: string;
  planName: string;
  months: number;
  /** Preço cheio: mensal × meses (sem nenhum desconto). */
  listCents: number;
  finalCents: number;
  /** Preço do plano mensal (base do recálculo no cancelamento). */
  monthlyCents: number | null;
  /** Linhas de desconto, já em texto. */
  discounts: { label: string; cents: number }[];
  /** Desconto além do desconto do próprio plano (parceria/promoção). */
  extraDiscountCents: number;
}

/**
 * Monta preço cheio, descontos e valor final.
 * - Desconto do plano: mensal × meses - preço do plano no catálogo.
 * - Desconto de promoção/parceria: preço do plano no catálogo - valor cobrado.
 */
export function buildPlanPricing(
  plan: { slug: string; name: string; duration_months: number },
  finalCents: number,
  catalog: CatalogPlanLike[],
  partnerCode?: string | null,
): PlanPricing {
  const months = Math.max(1, plan.duration_months);
  const monthly = catalog.find((p) => p.duration_months === 1) ?? null;
  const catalogPlan = catalog.find((p) => p.slug === plan.slug) ?? null;
  const planCents = catalogPlan?.price_cents ?? finalCents;
  const listCents = monthly ? Math.max(monthly.price_cents * months, planCents) : planCents;
  const discounts: PlanPricing["discounts"] = [];
  const planDiscount = listCents - planCents;
  if (planDiscount > 0) discounts.push({ label: `Desconto do plano ${plan.name}`, cents: planDiscount });
  const extra = planCents - finalCents;
  if (extra > 0) {
    const code = (partnerCode ?? "").trim();
    discounts.push({ label: code ? `Desconto de parceria (código ${code})` : "Desconto promocional", cents: extra });
  }
  return {
    planSlug: plan.slug,
    planName: plan.name,
    months,
    listCents: Math.max(listCents, finalCents),
    finalCents,
    monthlyCents: monthly?.price_cents ?? null,
    discounts,
    extraDiscountCents: Math.max(0, extra),
  };
}

// ── CPF ─────────────────────────────────────────────────────────────────────
export function onlyDigits(v: string): string {
  return (v || "").replace(/\D/g, "");
}

export function isValidCpf(value: string): boolean {
  const d = onlyDigits(value);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

export function formatCpf(value: string): string {
  const d = onlyDigits(value).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

export function isValidCpfOrCnpj(v: string): boolean {
  const d = onlyDigits(v);
  if (d.length === 11) return isValidCpf(d);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (len: number) => {
    const w = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const s = w.reduce((acc, wi, i) => acc + wi * Number(d[i]), 0);
    const r = s % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export function formatDocument(value: string | null | undefined): string | null {
  const d = onlyDigits(value ?? "");
  if (d.length === 11) return formatCpf(d);
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  return null;
}

// ── Texto ───────────────────────────────────────────────────────────────────
export interface ContractInput {
  party: ContractParty;
  /** Planos do coach na data do aceite (tabela de valores). */
  catalog?: CatalogPlanLike[];
  student: { name: string; email?: string | null; city?: string | null; birthDate?: string | null; cpf?: string | null };
  guardian?: { name: string; cpf: string } | null;
  /** Sem plano (aceite no cadastro): o contrato traz só a tabela de planos. */
  pricing?: PlanPricing | null;
  startDate?: string | null;
}

export interface ContractSection { title: string; items: string[] }

const brl = (c: number) => formatCents(c).replace(/\u00a0/g, " ");

function formatWhatsapp(v: string | null | undefined): string | null {
  const d = onlyDigits(v ?? "").replace(/^55(?=\d{10,11}$)/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d ? d : null;
}

function formatInstagram(v: string | null | undefined): string | null {
  const t = (v ?? "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "").replace(/^@/, "");
  return t ? `@${t}` : null;
}

/** "Mensal: R$ 350,00 por mês" / "Trimestral (3 meses): R$ 892,50 (R$ 297,50 por mês, 15% de desconto)". */
export function planTableLines(catalog: CatalogPlanLike[]): string[] {
  const sorted = [...catalog].sort((a, b) => a.duration_months - b.duration_months);
  const monthly = sorted.find((p) => p.duration_months === 1);
  return sorted.map((p) => {
    if (p.duration_months === 1) return `${p.name}: ${brl(p.price_cents)} por mês`;
    const perMonth = Math.round(p.price_cents / p.duration_months);
    const pct = monthly ? Math.round((1 - perMonth / monthly.price_cents) * 100) : 0;
    return `${p.name} (${p.duration_months} meses): ${brl(p.price_cents)} (${brl(perMonth)} por mês${pct > 0 ? `, ${pct}% de desconto` : ""})`;
  });
}

export function renderContract(i: ContractInput): ContractSection[] {
  const p = i.pricing;
  const docDigits = onlyDigits(i.party.document ?? "");
  const coachDoc = formatDocument(docDigits);
  const isCompany = docDigits.length === 14;
  const isPlatform = docDigits === PLATFORM_CNPJ;
  const cref = i.party.cref ? `CREF n.º ${i.party.cref.replace(/^CREF\s*/i, "")}` : null;
  const coachId = isCompany
    ? [
        (i.party.company_name || (isPlatform ? PLATFORM_NAME : null) || i.party.team_name || i.party.name).trim(),
        `CNPJ n.º ${coachDoc}`,
        i.party.email ? `e-mail ${i.party.email}` : null,
        `tendo como responsável técnico ${i.party.name}, Profissional de Educação Física${cref ? `, ${cref}` : ""}`,
      ].filter(Boolean).join(", ")
    : [
        `${i.party.name}${i.party.team_name ? ` (${i.party.team_name})` : ""}, Profissional de Educação Física`,
        cref,
        coachDoc ? `CPF n.º ${coachDoc}` : i.party.document_masked ? `CPF n.º ${i.party.document_masked}` : null,
        i.party.email ? `e-mail ${i.party.email}` : null,
      ].filter(Boolean).join(", ");
  const studentId = [
    i.student.name,
    i.student.cpf ? `CPF n.º ${formatCpf(i.student.cpf)}` : null,
    i.student.birthDate ? `nascido(a) em ${i.student.birthDate}` : null,
    i.student.city ? `residente em ${i.student.city}` : null,
    i.student.email ? `e-mail ${i.student.email}` : null,
  ].filter(Boolean).join(", ");
  const whats = formatWhatsapp(i.party.whatsapp);
  const insta = formatInstagram(i.party.instagram);
  const orJoin = (parts: (string | null)[]) => parts.filter(Boolean).join(", ").replace(/, ([^,]*)$/, " ou $1");
  const contact = orJoin(["pelo app", whats ? `pelo WhatsApp ${whats}` : null, i.party.email ? `pelo e-mail ${i.party.email}` : null]);
  const support = orJoin([
    "pelo app",
    whats ? `pelo WhatsApp de atendimento informado no app (${whats})` : "pelo WhatsApp de atendimento informado no app",
    insta ? `pelo Instagram ${insta}` : null,
  ]);
  const cat = i.catalog ?? [];
  const catMonthly = [...cat].find((c) => c.duration_months === 1) ?? null;
  const catHasDiscount = !!catMonthly && cat.some((c) => c.duration_months > 1 && c.price_cents < catMonthly.price_cents * c.duration_months);

  const table = planTableLines(cat);
  const planLines = p
    ? [
        `Plano contratado: ${p.planName}, com duração de ${p.months === 1 ? "1 mês" : `${p.months} meses`}${i.startDate ? `, a partir de ${i.startDate}` : ""}.`,
        `Preço cheio: ${brl(p.listCents)}.`,
        ...p.discounts.map((d) => `${d.label}: - ${brl(d.cents)}.`),
        `Valor final: ${brl(p.finalCents)}, pago pelo meio escolhido no pagamento.`,
        "Descontos de parceria ou promoção só valem quando aparecem acima, para este plano.",
      ]
    : [
        "O plano escolhido, o valor final e eventual desconto de parceria (com o código usado) são mostrados e registrados no app no momento do pagamento, de acordo com esta tabela.",
      ];
  const priceLines = [
    ...(table.length ? [`Valores dos planos na data do aceite: ${table.join("; ")}.`] : []),
    ...planLines,
    "Em caso de atraso: multa de 2%, juros de 1% ao mês e correção pelo IPCA. Depois de 10 dias de atraso, o acompanhamento pode ser suspenso, com aviso prévio, até a regularização.",
  ];
  const priceItems = priceLines.map((t, k) => `7.${k + 1} ${t}`);

  const monthlyRef = p ? p.monthlyCents : catMonthly?.price_cents ?? null;
  const discounted = p ? p.discounts.length > 0 && p.months > 1 && !!p.monthlyCents : catHasDiscount;
  const cancelItems = [
    `9.1 O CONTRATANTE pode cancelar quando quiser, ${contact}. O atendimento segue até o fim do mês de plano já iniciado; os meses seguintes deixam de ser cobrados.`,
    discounted
      ? `9.2 Nos planos com desconto (como o trimestral), o desconto depende da duração completa do plano. Se cancelar antes, os meses já iniciados são recalculados pelo valor do plano mensal (${brl(monthlyRef!)} por mês), até o limite do valor pago pelo plano. Se tiver pago menos que isso, paga a diferença; se tiver pago mais, recebe a diferença de volta em até 30 dias. Não há outra multa.`
      : "9.2 Não há multa de cancelamento.",
    "9.3 O CONTRATADO pode encerrar o contrato com aviso de 15 dias, devolvendo o valor do período não prestado.",
    "9.4 Em caso de descumprimento grave (por exemplo, informação de saúde falsa que coloque o CONTRATANTE em risco ou compartilhamento do acesso), qualquer parte pode encerrar o contrato na hora, com devolução do valor do período não prestado, descontado o que for devido por quem deu causa.",
    "9.5 Encerrado o contrato, o acompanhamento termina. Os dados ficam guardados conforme a Política de Privacidade e podem ser copiados ou excluídos a pedido.",
  ];

  return [
    {
      title: "PARTES",
      items: [
        `CONTRATADO: ${coachId}.`,
        `CONTRATANTE: ${studentId}.`,
        ...(i.guardian ? [`RESPONSÁVEL LEGAL (contratante menor de 18 anos): ${i.guardian.name}, CPF n.º ${formatCpf(i.guardian.cpf)}, que aceita este contrato em nome do menor e responde pelas obrigações dele.`] : []),
        isPlatform
          ? "PLATAFORMA: o atendimento é feito pela plataforma Elite Prime Hub, que pertence ao próprio CONTRATADO."
          : "PLATAFORMA: Elite Prime Hub, CNPJ n.º 68.650.322/0001-10, fornece a tecnologia usada no atendimento e não presta o serviço de consultoria.",
        "Sem vínculo empregatício. Aplicam-se a Lei n.º 9.696/1998, a Resolução CONFEF n.º 542/2024, o Código de Defesa do Consumidor e a LGPD.",
      ],
    },
    {
      title: "1. OBJETO",
      items: [
        "1.1 Consultoria em treinamento físico a distância: avaliação inicial pelo app (anamnese, fotos e informações do CONTRATANTE), programa de treino individualizado e periodizado, acompanhamento e ajustes durante o plano.",
        "1.2 Alimentação: o CONTRATADO dá orientações gerais de alimentação saudável ligadas aos treinos. Elas não são prescrição de dieta nem de suplementos e não substituem o acompanhamento de um nutricionista.",
        "1.3 O serviço não inclui atendimento médico, fisioterapêutico, psicológico ou nutricional, nem diagnóstico ou tratamento de doenças.",
      ],
    },
    {
      title: "2. COMO FUNCIONA",
      items: [
        "2.1 Tudo acontece pelo app, com acesso pessoal e intransferível.",
        "2.2 O treino é revisado nos check-ins combinados com o CONTRATADO, ou antes, se ele entender necessário.",
        `2.3 Dúvidas e análise de execução por vídeo ou foto: ${support}, com resposta em até 2 dias úteis.`,
        "2.4 Se o atendimento a distância não for suficiente, o CONTRATADO pode recomendar avaliação presencial ou outro profissional de saúde.",
        "2.5 Ninguém grava ou compartilha chamadas, vídeos ou fotos do atendimento sem combinar antes.",
      ],
    },
    {
      title: "3. O QUE CABE AO CONTRATANTE",
      items: [
        "3.1 Informar com verdade doenças, lesões, cirurgias, remédios, gestação, sintomas e mudanças de saúde.",
        "3.2 Apresentar liberação médica quando tiver condição que limite exercícios ou quando o CONTRATADO pedir. Recomenda-se avaliação médica antes de começar.",
        "3.3 Parar o exercício e procurar atendimento médico se sentir dor no peito, falta de ar fora do normal, tontura, desmaio ou dor forte, e avisar o CONTRATADO.",
        "3.4 Treinar em local seguro, seguindo as orientações, e manter a senha em sigilo.",
        "3.5 Pagar na forma combinada.",
      ],
    },
    {
      title: "4. O QUE CABE AO CONTRATADO",
      items: [
        "4.1 Atender com técnica, ética e base científica, conforme o Código de Ética do Profissional de Educação Física.",
        "4.2 Manter o registro do plano de treino do CONTRATANTE (Resolução CONFEF n.º 542/2024).",
        "4.3 Levar em conta as informações de saúde, adaptando ou deixando de prescrever exercícios quando houver risco.",
        "4.4 Guardar sigilo sobre as informações do CONTRATANTE.",
      ],
    },
    {
      title: "5. RESULTADOS E RESPONSABILIDADE",
      items: [
        "5.1 O CONTRATADO usa os melhores meios técnicos, mas o resultado depende também da execução dos treinos, alimentação, sono, genética e saúde; por isso não há garantia de resultado específico.",
        "5.2 O CONTRATADO responde pelos seus atos nos termos da lei, mas não por danos causados por informações falsas ou omitidas pelo CONTRATANTE nem por exercícios feitos em desacordo com as orientações.",
      ],
    },
    {
      title: "6. VIGÊNCIA E RENOVAÇÃO",
      items: [
        "6.1 O plano vale pelo período contratado e não é renovado nem cobrado automaticamente.",
        "6.2 Para continuar, basta pagar a renovação. Enquanto este texto e o valor forem os mesmos, este aceite continua valendo; se mudarem, o app pede um novo aceite.",
        "6.3 Por motivo de saúde ou força maior, o plano pode ser pausado em comum acordo, e o término é adiado pelo mesmo número de dias.",
      ],
    },
    { title: "7. VALORES", items: priceItems },
    {
      title: "8. DESISTÊNCIA EM 7 DIAS",
      items: [
        `8.1 O CONTRATANTE pode desistir em até 7 dias corridos do pagamento, sem justificar, e recebe de volta todo o valor pago, pelo mesmo meio de pagamento (art. 49 do Código de Defesa do Consumidor). O pedido é feito ${contact}.`,
      ],
    },
    { title: "9. CANCELAMENTO DEPOIS DOS 7 DIAS", items: cancelItems },
    {
      title: "10. DADOS PESSOAIS E IMAGEM",
      items: [
        "10.1 Os dados são tratados conforme a Política de Privacidade (página /privacidade do app), só para este serviço. Dados de saúde e fotos dependem do consentimento dado no cadastro.",
        "10.2 O CONTRATANTE pode acessar, corrigir, copiar ou excluir seus dados e revogar o consentimento a qualquer momento. Sem esse consentimento o serviço não pode continuar, e o contrato é encerrado conforme a cláusula 9.",
        "10.3 Fotos e vídeos servem só para o acompanhamento. Divulgar qualquer imagem (como \"antes e depois\") depende de autorização separada, que pode ser revogada.",
      ],
    },
    {
      title: "11. ATENDIMENTO A DISTÂNCIA (TERMO DE CONSENTIMENTO)",
      items: [
        "11.1 O CONTRATANTE escolheu o atendimento a distância e sabe que pode recusá-lo; declara que suas informações são verdadeiras, que vai treinar em ambiente adequado e que a forma de atendimento e o valor foram combinados antes do início (Resolução CONFEF n.º 542/2024). Pode pedir cópia dos seus registros a qualquer momento.",
      ],
    },
    {
      title: "12. GERAL",
      items: [
        "12.1 Os treinos e materiais são para uso pessoal; não podem ser revendidos nem publicados.",
        "12.2 Este contrato é aceito eletronicamente, com o mesmo valor de um contrato assinado (MP n.º 2.200-2/2001, art. 10, § 2.º). O app registra data, hora, versão do texto e dados do acesso, e a cópia fica no Perfil do CONTRATANTE (Meu contrato).",
        "12.3 Divergências serão resolvidas primeiro por diálogo; não havendo acordo, vale o foro da cidade do CONTRATANTE.",
      ],
    },
  ];
}

export function contractToText(title: string, sections: ContractSection[]): string {
  return [title, `Versão ${CONTRACT_VERSION}`, "", ...sections.flatMap((s) => [s.title, ...s.items, ""])].join("\n").trim();
}

export const CONTRACT_TITLE = "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CONSULTORIA EM TREINAMENTO FÍSICO A DISTÂNCIA";

// ── Servidor ────────────────────────────────────────────────────────────────
export async function fetchContractParty(): Promise<ContractParty | null> {
  const { data, error } = await sb.rpc("contract_party_for_student");
  if (error || !data) return null;
  return data as ContractParty;
}

export interface AcceptanceRow {
  id: string;
  version: string;
  stage?: string;
  plan_slug: string | null;
  plan_name: string | null;
  final_price_cents: number | null;
  text_shown: string;
  accepted_at: string;
  cpf?: string;
  guardian_name?: string | null;
  guardian_cpf?: string | null;
}

/** Último aceite desta versão (cadastro ou pagamento). null = nenhum ou erro. */
export async function fetchMyCurrentAcceptance(studentId: string): Promise<AcceptanceRow | null> {
  const { data, error } = await sb
    .from("contract_acceptances")
    .select("id, version, stage, plan_slug, plan_name, final_price_cents, text_shown, accepted_at, cpf, guardian_name, guardian_cpf")
    .eq("student_id", studentId)
    .eq("version", CONTRACT_VERSION)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data ?? null) as AcceptanceRow | null;
}

/** Contrato antes do login (anamnese): dados públicos do coach + tabela de planos. */
export async function fetchContractPreview(coachId: string): Promise<{ party: ContractParty; catalog: CatalogPlanLike[] } | null> {
  try {
    const { data, error } = await sb.functions.invoke("contract-preview", { body: { coachId } });
    if (error || !data?.party) return null;
    return { party: data.party as ContractParty, catalog: (data.catalog ?? []) as CatalogPlanLike[] };
  } catch {
    return null;
  }
}

export interface StudentContractInfo { name: string; email: string | null; city: string | null; birth: string | null }

export async function fetchStudentContractInfo(studentId: string): Promise<StudentContractInfo> {
  const { data } = await sb
    .from("anamnesis")
    .select("nome:payload->>nome, email:payload->>email, cidade:payload->>cidade, data_nasc:payload->>data_nasc")
    .eq("student_id", studentId)
    .maybeSingle();
  const a = (data ?? {}) as { nome?: string; email?: string; cidade?: string; data_nasc?: string };
  return { name: a.nome?.trim() || "Aluno(a)", email: a.email ?? null, city: a.cidade ?? null, birth: a.data_nasc ?? null };
}

/**
 * Quem já aceitou o contrato no cadastro não precisa aceitar de novo ao pagar:
 * o plano escolhido é registrado sozinho (mesmo CPF), desde que não haja
 * desconto de parceria/promoção — esse pede uma confirmação rápida.
 * Retorna true se registrou (ou se já estava registrado).
 */
export async function recordPlanSilently(args: {
  studentId: string;
  prior: AcceptanceRow;
  plan: { slug: string; name: string; duration_months: number };
  finalCents: number;
  catalog: CatalogPlanLike[];
}): Promise<boolean> {
  if (!args.prior.cpf) return false;
  const party = await fetchContractParty();
  if (!party) return false;
  const pricing = buildPlanPricing(args.plan, args.finalCents, args.catalog, party.partner_code);
  if (pricing.extraDiscountCents > 0) return false;
  const info = await fetchStudentContractInfo(args.studentId);
  const guardian = args.prior.guardian_name && args.prior.guardian_cpf ? { name: args.prior.guardian_name, cpf: args.prior.guardian_cpf } : null;
  const text = contractToText(CONTRACT_TITLE, renderContract({
    party,
    catalog: args.catalog,
    pricing,
    guardian,
    student: { name: info.name, email: info.email, city: info.city, birthDate: info.birth ? formatBirthDate(info.birth) : null, cpf: guardian ? null : args.prior.cpf },
  }));
  try {
    await recordContractAcceptance({ studentId: args.studentId, party, pricing, cpf: args.prior.cpf, guardian, text, stage: "pagamento" });
    return true;
  } catch {
    return false;
  }
}

/** Há aceite desta versão para este plano e valor? null = não deu para saber (não bloqueia). */
export async function hasAcceptedContract(studentId: string, planSlug: string, finalCents: number): Promise<boolean | null> {
  const { data, error } = await sb
    .from("contract_acceptances")
    .select("id")
    .eq("student_id", studentId)
    .eq("version", CONTRACT_VERSION)
    .eq("stage", "pagamento")
    .eq("plan_slug", planSlug)
    .eq("final_price_cents", finalCents)
    .limit(1);
  if (error) return null;
  return (data ?? []).length > 0;
}

export async function fetchMyLatestContract(studentId: string): Promise<AcceptanceRow | null> {
  const { data, error } = await sb
    .from("contract_acceptances")
    .select("id, version, plan_slug, plan_name, final_price_cents, text_shown, accepted_at")
    .eq("student_id", studentId)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return (data ?? null) as AcceptanceRow | null;
}

export async function recordContractAcceptance(args: {
  studentId: string;
  party: ContractParty;
  pricing?: PlanPricing | null;
  cpf: string;
  guardian?: { name: string; cpf: string } | null;
  text: string;
  stage?: "cadastro" | "pagamento";
}): Promise<void> {
  const p = args.pricing ?? null;
  const { error } = await sb.from("contract_acceptances").insert({
    student_id: args.studentId,
    coach_id: args.party.coach_id,
    version: CONTRACT_VERSION,
    stage: args.stage ?? (p ? "pagamento" : "cadastro"),
    plan_slug: p?.planSlug ?? null,
    plan_name: p?.planName ?? null,
    duration_months: p?.months ?? null,
    list_price_cents: p?.listCents ?? null,
    final_price_cents: p?.finalCents ?? null,
    discount_note: p ? p.discounts.map((d) => `${d.label}: ${brl(d.cents)}`).join("; ") || null : null,
    cpf: onlyDigits(args.cpf),
    guardian_name: args.guardian?.name?.trim() || null,
    guardian_cpf: args.guardian ? onlyDigits(args.guardian.cpf) : null,
    text_shown: args.text,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 300) : null,
  });
  if (error) throw error;
}

/** Contrato do cadastro (anamnese): sem plano, com a tabela de planos. */
export function signupContractSections(args: {
  preview: { party: ContractParty; catalog: CatalogPlanLike[] };
  student: { name: string; email?: string | null; city?: string | null; birth?: string | null };
  cpf: string;
  guardianName?: string | null;
  minor: boolean;
}): ContractSection[] {
  return renderContract({
    party: args.preview.party,
    catalog: args.preview.catalog,
    pricing: null,
    student: {
      name: args.student.name || "Aluno(a)",
      email: args.student.email ?? null,
      city: args.student.city ?? null,
      birthDate: args.student.birth ? formatBirthDate(args.student.birth) : null,
      cpf: args.minor ? null : args.cpf,
    },
    guardian: args.minor ? { name: args.guardianName || "-", cpf: args.cpf } : null,
  });
}
