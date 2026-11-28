import { describe, it, expect } from "vitest";
import { accessPriority, addDaysKey, describeAccess, fallbackAccessState, formatDay, type AccessState } from "../studentAccess";

const today = "2026-11-28";
const base: AccessState = { blocked: false, reason: "ok" };

describe("selo de situação do aluno (Financeiro)", () => {
  it("parceira isenta aparece como vitalícia", () => {
    expect(describeAccess({ ...base, reason: "exempt", exempt: true, exempt_reason: "partner" }, today))
      .toEqual({ label: "Vitalícia", tone: "info", detail: "parceira" });
  });
  it("isenção manual", () => {
    expect(describeAccess({ ...base, reason: "exempt", exempt: true, exempt_reason: "manual" }, today).label).toBe("Isento");
  });
  it("liberado pelo coach até uma data", () => {
    expect(describeAccess({ ...base, reason: "granted", granted_until: "2026-12-28" }, today).label).toBe("Liberado até 28/12");
  });
  it("acesso pausado mostra desde quando", () => {
    const b = describeAccess({ ...base, blocked: true, reason: "overdue", block_on: "2026-11-20" }, today);
    expect(b).toEqual({ label: "Acesso pausado", tone: "danger", detail: "desde 20/11" });
  });
  it("atrasado dentro da tolerância mostra quando pausa", () => {
    const b = describeAccess({ ...base, reason: "grace", block_on: "2026-12-03" }, today);
    expect(b).toEqual({ label: "Atrasado", tone: "danger", detail: "pausa em 03/12" });
  });
  it("em dia até o fim do período pago", () => {
    expect(describeAccess({ ...base, paid_through: "2027-02-28" }, today)).toEqual({ label: "Em dia até 28/02", tone: "ok" });
  });
  it("cobrança aberta ainda não vencida", () => {
    expect(describeAccess({ ...base, pending_due: "2026-12-05" }, today)).toEqual({ label: "Vence 05/12", tone: "warn" });
  });
  it("sem plano nem cobrança", () => {
    expect(describeAccess(base, today).label).toBe("Sem plano");
    expect(describeAccess(null, today).label).toBe("Sem plano");
  });
});

describe("ordem da lista", () => {
  it("pausados primeiro, isentos por último", () => {
    const states: AccessState[] = [
      { ...base, reason: "exempt" },
      { ...base, paid_through: "2027-01-01" },
      { ...base, blocked: true, reason: "overdue" },
      { ...base, reason: "grace" },
      { ...base, pending_due: "2026-12-01" },
    ];
    const sorted = [...states].sort((a, b) => accessPriority(a) - accessPriority(b));
    expect(sorted.map((s) => (s.blocked ? "pausado" : s.reason === "grace" ? "atrasado" : s.reason === "exempt" ? "isento" : s.pending_due ? "vence" : "em dia")))
      .toEqual(["pausado", "atrasado", "vence", "em dia", "isento"]);
  });
});

describe("sem a regra nova no servidor (fallback)", () => {
  it("nunca pausa, mas mostra o atraso", () => {
    const s = fallbackAccessState({ isExempt: false, pendingDue: "2026-11-01", pendingCents: 35000, sub: null, today });
    expect(s.blocked).toBe(false);
    expect(s.reason).toBe("grace");
  });
  it("renovação antecipada não aparece como atraso", () => {
    const s = fallbackAccessState({
      isExempt: false, pendingDue: "2026-11-20", pendingCents: 35000, today,
      sub: { plan_slug: "monthly", plan_name: "Mensal", status: "active", next_due_date: "2026-12-20" },
    });
    expect(s.reason).toBe("ok");
    expect(describeAccess(s, today).label).toBe("Em dia até 20/12");
  });
  it("isento", () => {
    expect(fallbackAccessState({ isExempt: true, pendingDue: null, pendingCents: null, sub: null, today }).reason).toBe("exempt");
  });
});

describe("datas", () => {
  it("data só-dia não volta um dia por causa do fuso", () => {
    expect(formatDay("2026-11-28")).toBe("28/11/2026");
  });
  it("hoje + 30 dias", () => {
    expect(addDaysKey(30, new Date(2026, 10, 28))).toBe("2026-12-28");
  });
});
