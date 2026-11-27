import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildPlanPricing, contractToText, CONTRACT_TITLE, formatCpf, formatDocument, isValidCpf, isValidCpfOrCnpj, renderContract,
  signupContractSections,
} from "../serviceContract";

const catalog = [
  { slug: "monthly", name: "Mensal", price_cents: 35000, duration_months: 1 },
  { slug: "quarterly", name: "Trimestral", price_cents: 89250, duration_months: 3 },
  { slug: "semiannual", name: "Semestral", price_cents: 178500, duration_months: 6 },
];
const party = { coach_id: "c1", name: "Rennan", cref: "206788-G/SP", document: "68650322000110", email: "coach@x.com", whatsapp: "5511999998888", instagram: "@eliteprime" };
const personCoach = { coach_id: "c2", name: "Joana", cref: "123456-G/SP", document: "52998224725", email: "joana@x.com", team_name: "Team J" };

describe("preço, descontos e valor final", () => {
  it("mensal: sem desconto", () => {
    const p = buildPlanPricing(catalog[0], 35000, catalog);
    expect(p.listCents).toBe(35000);
    expect(p.discounts).toEqual([]);
  });
  it("trimestral: desconto do plano", () => {
    const p = buildPlanPricing(catalog[1], 89250, catalog);
    expect(p.listCents).toBe(105000);
    expect(p.discounts).toEqual([{ label: "Desconto do plano Trimestral", cents: 15750 }]);
  });
  it("trimestral com código de parceiro: dois descontos, com o código", () => {
    const p = buildPlanPricing(catalog[1], 80325, catalog, "JOAO10");
    expect(p.discounts.map((d) => d.cents)).toEqual([15750, 8925]);
    expect(p.discounts[1].label).toBe("Desconto de parceria (código JOAO10)");
    expect(p.finalCents).toBe(80325);
  });
  it("desconto extra separado do desconto do plano", () => {
    expect(buildPlanPricing(catalog[1], 89250, catalog).extraDiscountCents).toBe(0);
    expect(buildPlanPricing(catalog[1], 80325, catalog).extraDiscountCents).toBe(8925);
  });
  it("desconto extra sem código: promocional", () => {
    expect(buildPlanPricing(catalog[1], 80325, catalog).discounts[1].label).toBe("Desconto promocional");
  });
  it("plano fora do catálogo: mostra só o valor cobrado", () => {
    const p = buildPlanPricing({ slug: "x", name: "Especial", duration_months: 2 }, 50000, []);
    expect(p.listCents).toBe(50000);
    expect(p.discounts).toEqual([]);
  });
});

describe("CPF e CNPJ", () => {
  it("valida e formata", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    expect(isValidCpfOrCnpj("68.650.322/0001-10")).toBe(true);
    expect(isValidCpfOrCnpj("68.650.322/0001-11")).toBe(false);
    expect(formatDocument("68650322000110")).toBe("68.650.322/0001-10");
  });
});

describe("texto do contrato", () => {
  const pricing = buildPlanPricing(catalog[1], 80325, catalog, "JOAO10");
  const text = contractToText(CONTRACT_TITLE, renderContract({
    party, pricing, catalog, student: { name: "Ana", email: "a@b.com", city: "SP", birthDate: "10/05/1990", cpf: "52998224725" },
  }));
  it("traz partes, valores e descontos", () => {
    expect(text).toMatch(/CONTRATADO: Elite Prime Hub, CNPJ n\.º 68\.650\.322\/0001-10, .*responsável técnico Rennan, Profissional de Educação Física, CREF n\.º 206788-G\/SP/);
    expect(text).toMatch(/pertence ao próprio CONTRATADO/);
    expect(text).toContain("CPF n.º 529.982.247-25");
    expect(text).toMatch(/Preço cheio: R\$ 1\.050,00/);
    expect(text).toMatch(/Desconto de parceria \(código JOAO10\): - R\$ 89,25/);
    expect(text).toMatch(/Valores dos planos na data do aceite: Mensal: R\$ 350,00 por mês; Trimestral \(3 meses\): R\$ 892,50 \(R\$ 297,50 por mês, 15% de desconto\)/);
    expect(text).toMatch(/Valor final: R\$ 803,25/);
    expect(text).toMatch(/plano mensal \(R\$ 350,00 por mês\)/);
  });
  it("dúvidas pelo app, WhatsApp e Instagram", () => {
    expect(text).toMatch(/2\.3 .*pelo app, pelo WhatsApp de atendimento informado no app \(\(11\) 99999-8888\) ou pelo Instagram @eliteprime/);
    expect(text).toMatch(/pelo app, pelo WhatsApp \(11\) 99999-8888 ou pelo e-mail coach@x\.com/);
  });
  it("coach pessoa física: nome, CREF e CPF; plataforma separada", () => {
    const t = contractToText(CONTRACT_TITLE, renderContract({ party: personCoach, pricing, student: { name: "Ana", cpf: "52998224725" } }));
    expect(t).toMatch(/CONTRATADO: Joana \(Team J\), Profissional de Educação Física, CREF n\.º 123456-G\/SP, CPF n\.º 529\.982\.247-25/);
    expect(t).toMatch(/não presta o serviço de consultoria/);
  });
  it("alimentação: só orientações gerais", () => {
    expect(text).toMatch(/orientações gerais de alimentação/);
    expect(text).not.toMatch(/nutricionista com registro/);
  });
  it("7 dias, sem renovação automática, foro do aluno", () => {
    expect(text).toMatch(/7 dias corridos/);
    expect(text).toMatch(/não é renovado nem cobrado automaticamente/);
    expect(text).toMatch(/foro da cidade do CONTRATANTE/);
  });
  it("menor: responsável com CPF, sem CPF do menor", () => {
    const t = contractToText(CONTRACT_TITLE, renderContract({
      party, pricing, student: { name: "Léo", cpf: null }, guardian: { name: "Maria", cpf: "52998224725" },
    }));
    expect(t).toMatch(/RESPONSÁVEL LEGAL.*Maria, CPF n\.º 529\.982\.247-25/);
    expect(t).toMatch(/CONTRATANTE: Léo\./);
  });
  it("mensal sem desconto: sem multa e sem recálculo", () => {
    const t = contractToText(CONTRACT_TITLE, renderContract({ party, pricing: buildPlanPricing(catalog[0], 35000, catalog), student: { name: "Ana", cpf: "52998224725" } }));
    expect(t).toMatch(/Não há multa de cancelamento/);
  });
});

describe("contrato no cadastro (anamnese)", () => {
  const preview = { party: { ...party, email: null }, catalog };
  const t = contractToText(CONTRACT_TITLE, signupContractSections({
    preview, student: { name: "Ana", email: "a@b.com", city: "SP", birth: "1990-05-10" }, cpf: "52998224725", minor: false,
  }));
  it("traz a tabela de planos e diz que o plano é registrado no pagamento", () => {
    expect(t).toMatch(/Valores dos planos na data do aceite: Mensal: R\$ 350,00 por mês; Trimestral/);
    expect(t).toMatch(/registrados no app no momento do pagamento/);
    expect(t).not.toMatch(/Plano contratado:/);
    expect(t).toMatch(/nascido\(a\) em 10\/05\/1990/);
  });
  it("cancelamento com recálculo pelo mensal quando há plano com desconto", () => {
    expect(t).toMatch(/Nos planos com desconto .*R\$ 350,00 por mês/);
  });
  it("coach pessoa física aparece com CPF mascarado na rota pública", () => {
    const t2 = contractToText(CONTRACT_TITLE, signupContractSections({
      preview: { party: { coach_id: "c2", name: "Joana", cref: "123456-G/SP", document: null, document_masked: "***.982.247-**" }, catalog },
      student: { name: "Ana" }, cpf: "52998224725", minor: false,
    }));
    expect(t2).toMatch(/CPF n\.º \*\*\*\.982\.247-\*\*/);
  });
  it("menor: CPF do responsável", () => {
    const t3 = contractToText(CONTRACT_TITLE, signupContractSections({
      preview, student: { name: "Léo" }, cpf: "52998224725", guardianName: "Maria", minor: true,
    }));
    expect(t3).toMatch(/RESPONSÁVEL LEGAL.*Maria, CPF n\.º 529\.982\.247-25/);
  });
});

describe("migração do contrato", () => {
  it("aceite no cadastro sem plano e no pagamento com plano", () => {
    const sql = readFileSync("supabase/migrations/20261127130000_service_contract.sql", "utf8");
    expect(sql).toMatch(/stage\s+text NOT NULL DEFAULT 'pagamento' CHECK \(stage IN \('cadastro', 'pagamento'\)\)/);
    expect(sql).toMatch(/plan_slug\s+text,/);
  });
  const sql = readFileSync("supabase/migrations/20261127130000_service_contract.sql", "utf8");
  it("sem update/delete pelo app e horário do servidor", () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT ON public\.contract_acceptances TO authenticated/);
    expect(sql).not.toMatch(/FOR (UPDATE|DELETE)[^;]*contract_acceptances/);
    expect(sql).toMatch(/NEW\.accepted_at := now\(\)/);
  });
  it("o aceite fica guardado na exclusão de dados", () => {
    expect(sql).toMatch(/'contract_acceptances',/);
    expect(sql).toMatch(/student_id\s+uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
  });
});
