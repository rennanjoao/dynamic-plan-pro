import { describe, it, expect } from "vitest";
import { dueLabel, lastActivityLabel } from "@/lib/engagementFormat";
import { isNewAppOpen } from "@/lib/activityArea";

const now = new Date(2026, 9, 21, 12);

describe("engagement rules", () => {
  it("vencimento usa ends_on antes de next_due_date", () => {
    expect(dueLabel({ ends_on: "2026-10-26", next_due_date: "2026-10-22" }, now)).toBe("vence em 5 dias");
  });
  it("vencimento no passado", () => {
    expect(dueLabel({ next_due_date: "2026-10-19" }, now)).toBe("vencido há 2 dias");
  });
  it("sem plano", () => {
    expect(dueLabel(null, now)).toBe("Plano não informado");
  });
  it("última atividade em dias", () => {
    expect(lastActivityLabel("2026-10-18T10:00:00", now)).toBe("há 3 dias");
    expect(lastActivityLabel(null, now)).toBe("Sem dados");
  });
  it("abertura do app só após 30 minutos sem uso", () => {
    expect(isNewAppOpen(now.getTime() - 29 * 60_000, now.getTime())).toBe(false);
    expect(isNewAppOpen(now.getTime() - 31 * 60_000, now.getTime())).toBe(true);
  });
});
