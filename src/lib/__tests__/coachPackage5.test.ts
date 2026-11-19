import { describe, expect, it } from "vitest";
import {
  awaitingReplyByStudent, pickCheckinToOpen, unansweredSinceLastReply, waitingLabel,
} from "@/lib/coachPending";
import {
  adherenceTotals, currentPeriodizationWeekNumber, mealAdherence, plannedMealsPerDay,
  plannedSessionsPerWeek, startOfWeekMonday, weeklyTrainingAdherence, weeksSince,
} from "@/lib/coachCycleSummary";
import { countPresent, deviationTrend, sanitizeFindings, type PostureQuickCheck } from "@/lib/postureQuick";
import { buildProgressSeries, MAX_POINTS, metricValueOf } from "@/lib/progressSeries";
import { metricLabel, metricRows, metricValue } from "@/lib/checkinMetricLabels";
import { notificationTarget } from "@/lib/coachNotifications";

const ci = (id: string, submitted_at: string, coach_feedback: string | null, student_id = "s1") =>
  ({ id, submitted_at, coach_feedback, student_id });

describe("pendências do coach (check-ins aguardando resposta)", () => {
  it("aluna que enviou e não teve resposta fica pendente — mesmo estando 'Em dia'", () => {
    const m = awaitingReplyByStudent([
      ci("a", "2026-11-18T10:00:00Z", null),
      ci("b", "2026-11-04T10:00:00Z", "ok"),
      ci("c", "2026-11-18T10:00:00Z", "respondido", "s2"),
    ]);
    expect(m.get("s1")).toEqual({ count: 1, since: "2026-11-18T10:00:00Z" });
    expect(m.has("s2")).toBe(false);
  });

  it("conta só os pendentes depois do último respondido (antigos não voltam a cobrar)", () => {
    const rows = [
      ci("d", "2026-11-18T10:00:00Z", null),
      ci("c", "2026-11-04T10:00:00Z", "  "), // só espaços = sem resposta
      ci("b", "2026-10-21T10:00:00Z", "ok"),
      ci("a", "2026-10-07T10:00:00Z", null), // anterior ao último respondido
    ];
    expect(unansweredSinceLastReply(rows).map((r) => r.id)).toEqual(["c", "d"]);
    expect(awaitingReplyByStudent(rows).get("s1")).toEqual({ count: 2, since: "2026-11-04T10:00:00Z" });
  });

  it("painel abre o mais antigo sem resposta; com tudo respondido, o mais recente", () => {
    expect(pickCheckinToOpen([ci("b", "2026-11-18T10:00:00Z", null), ci("a", "2026-11-04T10:00:00Z", null)])?.id).toBe("a");
    expect(pickCheckinToOpen([ci("b", "2026-11-18T10:00:00Z", "x"), ci("a", "2026-11-04T10:00:00Z", "y")])?.id).toBe("b");
    expect(pickCheckinToOpen([])).toBeNull();
  });

  it("tempo de espera em palavras", () => {
    const now = new Date(2026, 10, 19, 9, 0);
    expect(waitingLabel(new Date(2026, 10, 19, 1, 0).toISOString(), now)).toBe("hoje");
    expect(waitingLabel(new Date(2026, 10, 18, 23, 0).toISOString(), now)).toBe("ontem");
    expect(waitingLabel(new Date(2026, 10, 15, 12, 0).toISOString(), now)).toBe("há 4 dias");
  });

  it("aviso de check-in/anamnese abre a tela certa; dúvida continua no sininho", () => {
    expect(notificationTarget("Check-in")).toBe("checkin");
    expect(notificationTarget("Anamnese")).toBe("anamnese");
    expect(notificationTarget("Treino")).toBeNull();
  });
});

const strength = (name = "Agachamento") => ({ name, is_mobility: false });
const mobility = { name: "Mobilidade de quadril", is_mobility: true };

describe("resumo do ciclo — treinos previstos e adesão real", () => {
  it("previsto = dias da semana ligados a treino de força (mobilidade não conta)", () => {
    const payload = {
      workouts: [
        { key: "A", exercises: [strength()] },
        { key: "B", exercises: [strength("Supino")] },
        { key: "M", exercises: [mobility] },
      ],
      weekDays: { seg: "A", ter: "B", qua: "M", qui: "A", sex: "REST", sab: "" },
    };
    expect(plannedSessionsPerWeek(payload)).toBe(3);
  });

  it("sem dias da semana definidos, previsto = número de treinos de força (A/B/C/D = 4)", () => {
    const payload = { workouts: ["A", "B", "C", "D"].map((key) => ({ key, exercises: [strength()] })), weekDays: {} };
    expect(plannedSessionsPerWeek(payload)).toBe(4);
    expect(plannedSessionsPerWeek({ workouts: [] })).toBeNull();
  });

  it("aluna que treinou 2x no mês NÃO aparece com 100%", () => {
    const now = new Date(2026, 10, 19, 12); // quinta
    const sessions = [
      { started_at: new Date(2026, 10, 3, 8).toISOString(), ended_at: new Date(2026, 10, 3, 9).toISOString() },
      { started_at: new Date(2026, 10, 10, 8).toISOString(), ended_at: new Date(2026, 10, 10, 9).toISOString() },
    ];
    const weeks = weeklyTrainingAdherence(sessions, 4, 4, now);
    expect(weeks).toHaveLength(4);
    expect(weeks[3].isCurrent).toBe(true);
    const t = adherenceTotals(weeks);
    expect(t).toEqual({ done: 2, planned: 12, pct: 17 });
  });

  it("duas sessões no mesmo dia contam 1; sessão aberta só conta com série concluída; excesso não compensa", () => {
    const now = new Date(2026, 10, 19, 12);
    const d = (day: number, h: number) => new Date(2026, 10, day, h).toISOString();
    const sessions = [
      { started_at: d(10, 7), ended_at: d(10, 8) },
      { started_at: d(10, 18), ended_at: d(10, 19) }, // mesmo dia
      { started_at: d(11, 7), ended_at: null, hasCompletedSets: true },
      { started_at: d(12, 7), ended_at: null, hasCompletedSets: false }, // abriu e não fez nada
      ...[3, 4, 5, 6, 7, 8].map((day) => ({ started_at: d(day, 7), ended_at: d(day, 8) })), // semana de 6 treinos
    ];
    const weeks = weeklyTrainingAdherence(sessions, 3, 4, now);
    expect(weeks[2].done).toBe(2); // semana de 10/11
    expect(weeks[1].done).toBe(6); // semana de 03/11
    expect(adherenceTotals(weeks)).toEqual({ done: 5, planned: 9, pct: 56 });
  });

  it("semana começa na segunda-feira (domingo pertence à semana anterior)", () => {
    // 19/11/2026 é quinta → segunda é 16/11; domingo 22/11 ainda é dessa semana.
    expect(startOfWeekMonday(new Date(2026, 10, 22, 10)).getDate()).toBe(16);
    expect(startOfWeekMonday(new Date(2026, 10, 16, 0, 1)).getDate()).toBe(16);
    expect(startOfWeekMonday(new Date(2026, 10, 23, 10)).getDate()).toBe(23);
  });

  it("refeições: dias com marcação nos últimos 7 dias completos (hoje não entra) e média", () => {
    const now = new Date(2026, 10, 19, 9);
    const rows = [
      { date: "2026-11-18", meal_index: 0, checked: true },
      { date: "2026-11-18", meal_index: 1, checked: true },
      { date: "2026-11-17", meal_index: 0, checked: true },
      { date: "2026-11-17", meal_index: 1, checked: false },
      { date: "2026-11-19", meal_index: 0, checked: true }, // hoje
      { date: "2026-11-10", meal_index: 0, checked: true }, // fora da janela
    ];
    expect(mealAdherence(rows, 7, now)).toEqual({ daysWithChecks: 2, days: 7, avgPerDay: 0.4 });
  });

  it("refeições do plano = as de dia de treino (versão descanso não soma)", () => {
    expect(plannedMealsPerDay({ meals: [{ day_type: "all" }, { day_type: "training" }, { day_type: "rest" }, {}] })).toBe(3);
  });

  it("semana da periodização segue a mesma regra da tela da aluna (loop pelo calendário)", () => {
    const payload = { periodization: { enabled: true, weeks: [{ label: "S1" }, { label: "S2" }, { label: "S3" }, { label: "S4" }] } };
    const now = new Date(2026, 10, 19, 10);
    expect(currentPeriodizationWeekNumber(payload, new Date(2026, 10, 5, 20).toISOString(), now)).toEqual({ week: 3, total: 4, label: "S3" });
    // 01/10 → 49 dias → 7ª semana → em loop de 4 = Semana 4
    expect(currentPeriodizationWeekNumber(payload, new Date(2026, 9, 1).toISOString(), now)?.week).toBe(4);
    expect(currentPeriodizationWeekNumber({ periodization: { enabled: false } }, null, now)).toBeNull();
    expect(weeksSince(new Date(2026, 9, 29).toISOString(), now)).toBe(3);
  });
});

describe("postura rápida", () => {
  const chk = (date: string, findings: Record<string, string>): PostureQuickCheck =>
    ({ id: date, source_kind: "checkin", source_id: date, source_date: date, findings: sanitizeFindings(findings), note: null });

  it("ignora desvios desconhecidos e graus inválidos", () => {
    expect(sanitizeFindings({ ombros_desnivelados: "mild", inventado: "mild", joelhos_para_dentro: "muito" })).toEqual({ ombros_desnivelados: "mild" });
    expect(sanitizeFindings([1, 2])).toEqual({});
  });

  it("tendência compara a primeira e a última vez avaliada (pula datas sem marcação)", () => {
    const checks = [
      chk("2026-11-01", { ombros_desnivelados: "none" }),
      chk("2026-09-01", { ombros_desnivelados: "marked", joelhos_para_dentro: "mild" }),
      chk("2026-10-01", { joelhos_para_dentro: "mild" }),
    ];
    expect(deviationTrend(checks, "ombros_desnivelados")).toBe("melhorou");
    expect(deviationTrend(checks, "joelhos_para_dentro")).toBe("igual");
    expect(deviationTrend(checks, "pes_desabados")).toBeNull();
    expect(deviationTrend([chk("2026-09-01", { pes_desabados: "none" }), chk("2026-10-01", { pes_desabados: "mild" })], "pes_desabados")).toBe("piorou");
    expect(countPresent({ a: "none", b: "mild", c: "marked" })).toBe(2);
  });
});

describe("gráfico de evolução", () => {
  const anam = { submitted_at: "2026-01-05T12:00:00Z", baseline_metrics: { peso: 80, cintura: 90, altura: 165 }, payload: { gender: "F" } };

  it("usa a data de ENVIO do check-in (editar/responder não move o ponto)", () => {
    const pts = buildProgressSeries({
      anamnesis: anam,
      checkIns: [{ submitted_at: "2026-02-02T12:00:00Z", current_metrics: { peso: 78 }, updated_at: "2026-03-30T12:00:00Z" } as never],
      metric: "peso",
    });
    expect(pts.map((p) => p.date)).toEqual(["05/01", "02/02"]);
  });

  it("com mais de 14 medições, o ponto de partida (anamnese) continua no gráfico", () => {
    const checkIns = Array.from({ length: 20 }, (_, i) => ({
      submitted_at: new Date(Date.UTC(2026, 1, 1 + i * 7, 12)).toISOString(),
      current_metrics: { peso: 79 - i * 0.2 },
    }));
    const pts = buildProgressSeries({ anamnesis: anam, checkIns, metric: "peso" });
    expect(pts).toHaveLength(MAX_POINTS);
    expect(pts[0].isBaseline).toBe(true);
    expect(pts[0].value).toBe(80);
    expect(pts[pts.length - 1].value).toBeCloseTo(75.2);
  });

  it("outras medidas: cintura, braço (média contraído D/E) e coxa; zero/vazio não vira ponto", () => {
    expect(metricValueOf({ braco_d_contraido: 30, braco_e_contraido: 31 }, "braco")).toBe(30.5);
    expect(metricValueOf({ braco_d_relaxado: "28,4" }, "braco")).toBe(28.4);
    expect(metricValueOf({ coxa_d: 55 }, "coxa")).toBe(55);
    const pts = buildProgressSeries({
      anamnesis: anam,
      checkIns: [{ submitted_at: "2026-02-02T12:00:00Z", current_metrics: { cintura: 0 } }, { submitted_at: "2026-02-16T12:00:00Z", current_metrics: { cintura: 87 } }],
      metric: "cintura",
    });
    expect(pts.map((p) => p.value)).toEqual([90, 87]);
  });
});

describe("rótulos das medidas no histórico", () => {
  it("troca a chave técnica pelo rótulo do formulário e não mostra JSON", () => {
    expect(metricLabel("braco_d_relaxado").label).toBe("Braço D Rel.");
    expect(metricLabel("panturrilha_e").label).toBe("Panturrilha e");
    expect(metricValue(62.5, "kg")).toBe("62,5 kg");
    expect(metricValue({ peso: 60, cintura: 70 })).toBe("Peso: 60, Cintura: 70");
    const rows = metricRows({ cintura: 70, peso: 60, vazio: "", braco_d_contraido: 31 });
    expect(rows.map((r) => r.label)).toEqual(["Peso", "Cintura", "Braço D Cont."]);
  });
});
