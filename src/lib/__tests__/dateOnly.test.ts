import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { parseDateOnly, isPastDue, localDateKey } from "../dateOnly";

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

describe("localDateKey (dia local, não UTC)", () => {
  const originalTZ = process.env.TZ;
  beforeAll(() => { process.env.TZ = "America/Sao_Paulo"; });
  afterAll(() => { process.env.TZ = originalTZ; });

  it("21h30 em São Paulo continua sendo o mesmo dia (UTC já seria amanhã)", () => {
    const evening = new Date("2026-11-18T00:30:00Z"); // 17/11 21:30 em SP
    expect(evening.toISOString().slice(0, 10)).toBe("2026-11-18");
    expect(localDateKey(evening)).toBe("2026-11-17");
  });

  it("aceita timestamp ISO do banco", () => {
    expect(localDateKey("2026-11-18T01:59:00Z")).toBe("2026-11-17");
    expect(localDateKey("2026-11-18T03:00:00Z")).toBe("2026-11-18");
  });

  it("data só-dia volta igual (não recua um dia)", () => {
    expect(localDateKey("2026-11-10")).toBe("2026-11-10");
  });

  it("valor inválido vira string vazia", () => {
    expect(localDateKey("não é data")).toBe("");
  });
});
