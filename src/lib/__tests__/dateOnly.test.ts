import { describe, it, expect } from "vitest";
import { parseDateOnly, isPastDue } from "../dateOnly";

describe("dateOnly", () => {
  it("lê 'YYYY-MM-DD' como meia-noite LOCAL (nunca no dia anterior)", () => {
    const d = parseDateOnly("2026-11-10")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 10, 10, 0]);
  });

  it("no dia do vencimento (de manhã ou à noite) NÃO está atrasado", () => {
    expect(isPastDue("2026-11-10", new Date(2026, 10, 10, 0, 1))).toBe(false);
    expect(isPastDue("2026-11-10", new Date(2026, 10, 10, 23, 59))).toBe(false);
  });

  it("na véspera, à noite, NÃO está atrasado (bug antigo: marcava atrasado às 21h do dia 9)", () => {
    expect(isPastDue("2026-11-10", new Date(2026, 10, 9, 21, 30))).toBe(false);
  });

  it("no dia seguinte está atrasado", () => {
    expect(isPastDue("2026-11-10", new Date(2026, 10, 11, 0, 1))).toBe(true);
  });

  it("valores vazios ou inválidos não quebram", () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly("")).toBeNull();
    expect(parseDateOnly("lixo")).toBeNull();
    expect(isPastDue(undefined)).toBe(false);
  });
});
