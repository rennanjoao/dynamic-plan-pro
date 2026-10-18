/**
 * Semana do ciclo: LOOP pelo calendário (1 → 2 → 3 → 4 → volta para a 1),
 * independente de a aluna abrir o treino, usar o Modo Treino ou registrar séries.
 */
import { describe, expect, it, vi } from "vitest";
import { calendarWeekIndex, useCurrentPeriodizationWeek } from "../useCurrentPeriodizationWeek";

// A semana não pode depender de nenhuma consulta: se alguém voltar a importar o banco
// neste módulo, o import quebra e estes testes falham.
vi.mock("@/integrations/supabase/client", () => {
  throw new Error("A semana do ciclo não pode consultar o banco (nem olhar sessões de treino).");
});

/** Data local (sem depender do fuso de quem roda o teste). */
const at = (y: number, m: number, d: number, hh = 12, mm = 0) => new Date(y, m - 1, d, hh, mm);
/** N dias de calendário atrás, no mesmo horário (imune a mudança de horário de verão). */
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

describe("calendarWeekIndex — loop de 4 semanas a partir do dia em que abriu o protocolo", () => {
  const start = at(2026, 10, 6, 15, 20).toISOString(); // terça, 15h20
  const dayN = (n: number) => at(2026, 10, 6 + n, 12, 0);

  it("percorre 1 → 2 → 3 → 4 em blocos de 7 dias", () => {
    expect([0, 6].map((n) => calendarWeekIndex(start, 4, dayN(n)))).toEqual([0, 0]);
    expect([7, 13].map((n) => calendarWeekIndex(start, 4, dayN(n)))).toEqual([1, 1]);
    expect([14, 20].map((n) => calendarWeekIndex(start, 4, dayN(n)))).toEqual([2, 2]);
    expect([21, 27].map((n) => calendarWeekIndex(start, 4, dayN(n)))).toEqual([3, 3]);
  });

  it("depois da Semana 4 VOLTA para a Semana 1 e continua girando", () => {
    expect(calendarWeekIndex(start, 4, dayN(28))).toBe(0); // 5ª semana = Semana 1 de novo
    expect(calendarWeekIndex(start, 4, dayN(35))).toBe(1);
    expect(calendarWeekIndex(start, 4, dayN(42))).toBe(2);
    expect(calendarWeekIndex(start, 4, dayN(49))).toBe(3);
    expect(calendarWeekIndex(start, 4, dayN(56))).toBe(0);
    expect(calendarWeekIndex(start, 4, dayN(7 * 4 * 10 + 14))).toBe(2); // 10 ciclos depois
  });

  it("a semana vira à meia-noite, não no horário exato da primeira abertura", () => {
    expect(calendarWeekIndex(start, 4, at(2026, 10, 12, 23, 59))).toBe(0);
    expect(calendarWeekIndex(start, 4, at(2026, 10, 13, 0, 5))).toBe(1);
    expect(calendarWeekIndex(start, 4, at(2026, 11, 2, 23, 59))).toBe(3);
    expect(calendarWeekIndex(start, 4, at(2026, 11, 3, 0, 1))).toBe(0);
  });

  it("data de início no futuro (relógio) = Semana 1", () => {
    expect(calendarWeekIndex(at(2026, 10, 20).toISOString(), 4, at(2026, 10, 6))).toBe(0);
  });

  it("sem data válida devolve null", () => {
    expect(calendarWeekIndex(null, 4)).toBeNull();
    expect(calendarWeekIndex(undefined, 4)).toBeNull();
    expect(calendarWeekIndex("", 4)).toBeNull();
    expect(calendarWeekIndex("não é data", 4)).toBeNull();
    expect(calendarWeekIndex(start, 0)).toBeNull();
  });
});

describe("useCurrentPeriodizationWeek (usado pela tela de treino)", () => {
  it("10 dias depois de abrir o protocolo: Semana 2", () => {
    expect(useCurrentPeriodizationWeek(true, 4, daysAgo(10))).toBe(1);
  });

  it("ela nunca treinou nem abriu o Modo Treino, e a semana corre mesmo assim (só depende da data)", () => {
    expect(useCurrentPeriodizationWeek(true, 4, daysAgo(15))).toBe(2);
  });

  it("depois de 4 semanas volta para a Semana 1", () => {
    expect(useCurrentPeriodizationWeek(true, 4, daysAgo(28))).toBe(0);
    expect(useCurrentPeriodizationWeek(true, 4, daysAgo(31))).toBe(0);
    expect(useCurrentPeriodizationWeek(true, 4, daysAgo(35))).toBe(1);
  });

  it("protocolo ainda não aberto (sem data) ou data inválida: Semana 1", () => {
    expect(useCurrentPeriodizationWeek(true, 4, null)).toBe(0);
    expect(useCurrentPeriodizationWeek(true, 4, undefined)).toBe(0);
    expect(useCurrentPeriodizationWeek(true, 4, "lixo")).toBe(0);
  });

  it("periodização desligada: não devolve semana", () => {
    expect(useCurrentPeriodizationWeek(false, 4, daysAgo(15))).toBeUndefined();
  });
});
