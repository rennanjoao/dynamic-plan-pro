import { describe, it, expect } from "vitest";
import {
  DEFAULT_STUDENT_PLANS, toCents, centsToAmount, formatCents, addMonths,
  nextDueDate, isGatewayMethodSupported, MAX_CARD_INSTALLMENTS,
} from "@/lib/studentPlans";
import { computeFinanceMetrics, type FinanceLike } from "@/lib/coachFinanceMetrics";

describe("catálogo dos planos dos alunos", () => {
  it("tem os três planos com valores exatos", () => {
    expect(DEFAULT_STUDENT_PLANS.map((p) => [p.slug, p.price_cents, p.duration_months])).toEqual([
      ["monthly", 35000, 1],
      ["quarterly", 75000, 3],
      ["semiannual", 140000, 6],
    ]);
  });

  it("converte reais para centavos sem erro de ponto flutuante", () => {
    expect(toCents(350)).toBe(35000);
    expect(toCents(1400)).toBe(140000);
    expect(toCents("R$ 1.400,00")).toBe(140000);
    expect(toCents(0.1 + 0.2)).toBe(30);
    expect(centsToAmount(140000)).toBe(1400);
    expect(formatCents(35000)).toContain("350,00");
  });

  it("calcula o próximo vencimento por ciclo", () => {
    expect(nextDueDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-01-15", 3)).toBe("2026-04-15");
    expect(addMonths("2026-01-15", 6)).toBe("2026-07-15");
  });

  it("expõe apenas métodos confirmados pela InfinityPay", () => {
    expect(isGatewayMethodSupported("pix")).toBe(true);
    expect(isGatewayMethodSupported("credit_card")).toBe(true);
    expect(isGatewayMethodSupported("boleto")).toBe(false);
    expect(isGatewayMethodSupported("pix_parcelado")).toBe(false);
    expect(MAX_CARD_INSTALLMENTS).toBe(12);
  });
});

const charge = (o: Partial<FinanceLike>): FinanceLike => ({
  id: Math.random().toString(36),
  student_id: "s1",
  amount: 350,
  status: "pending",
  due_date: null,
  paid_at: null,
  ...o,
});

describe("indicadores financeiros do coach", () => {
  const now = new Date("2026-06-15T12:00:00Z");

  it("separa recebido, previsto, atrasado, despesas e resultado", () => {
    const m = computeFinanceMetrics([
      charge({ status: "paid", amount: 350, paid_at: "2026-06-01" }),
      charge({ student_id: "s2", status: "paid", amount: 750, paid_at: "2026-06-02" }),
      charge({ student_id: "s3", status: "pending", amount: 1400, due_date: "2026-06-30" }),
      charge({ student_id: "s4", status: "pending", amount: 350, due_date: "2026-05-01" }),
      charge({ student_id: "s5", status: "canceled", amount: 350, due_date: "2026-06-20" }),
      charge({ student_id: null, amount: -200, status: "paid", paid_at: "2026-06-03" }),
    ], { now });

    expect(m.receitaRecebida).toBe(1100);
    expect(m.receitaPrevista).toBe(1750);
    expect(m.atrasado).toBe(350);
    expect(m.despesas).toBe(200);
    expect(m.resultado).toBe(900);
    expect(m.alunosPagantes).toBe(2);
    expect(m.ticketMedio).toBe(550);
    expect(m.alunosEmAtraso).toBe(1);
  });

  it("aluno sem plano/isento não gera receita fantasma", () => {
    const m = computeFinanceMetrics([], { now });
    expect(m.receitaRecebida).toBe(0);
    expect(m.ticketMedio).toBe(0);
  });

  it("múltiplas cobranças do mesmo aluno somam sem duplicar o pagante", () => {
    const m = computeFinanceMetrics([
      charge({ status: "paid", amount: 350, paid_at: "2026-06-01" }),
      charge({ status: "paid", amount: 350, paid_at: "2026-06-10" }),
    ], { now });
    expect(m.receitaRecebida).toBe(700);
    expect(m.alunosPagantes).toBe(1);
  });

  it("não mistura billing da plataforma: só recebe coach_finances", () => {
    // platform_billing_charges nunca é passado para a função — contrato do módulo.
    const m = computeFinanceMetrics([charge({ status: "paid", amount: 350, paid_at: "2026-06-01" })], { now });
    expect(m.receitaRecebida).toBe(350);
  });
});
