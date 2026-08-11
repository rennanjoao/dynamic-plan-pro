import { describe, it, expect } from "vitest";
import {
  sortPriorityQueue,
  buildOpenAlerts,
  formatMrvGroups,
  AI_QUEUE_LIMIT,
  type QueueRowLite,
} from "@/lib/coachPriorityQueue";

const row = (over: Partial<QueueRowLite>): QueueRowLite => ({
  student_id: "s1",
  source: "fatigue",
  severity: "info",
  title: "Título",
  message: "Mensagem",
  reference_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("ordenação da coach_priority_queue", () => {
  it("ordena por severidade e depois por reference_at mais recente", () => {
    const rows = [
      row({ title: "info-antigo", severity: "info", reference_at: "2026-01-01T00:00:00Z" }),
      row({ title: "warning", severity: "warning", reference_at: "2026-01-01T00:00:00Z" }),
      row({ title: "critical-antigo", severity: "critical", reference_at: "2026-01-01T00:00:00Z" }),
      row({ title: "critical-novo", severity: "critical", reference_at: "2026-02-01T00:00:00Z" }),
      row({ title: "info-novo", severity: "info", reference_at: "2026-03-01T00:00:00Z" }),
    ];
    expect(sortPriorityQueue(rows).map((r) => r.title)).toEqual([
      "critical-novo",
      "critical-antigo",
      "warning",
      "info-novo",
      "info-antigo",
    ]);
  });

  it("não muta o array original", () => {
    const rows = [row({ title: "a", severity: "info" }), row({ title: "b", severity: "critical" })];
    sortPriorityQueue(rows);
    expect(rows.map((r) => r.title)).toEqual(["a", "b"]);
  });
});

describe("openAlerts enviados ao assistente do coach", () => {
  const names = new Map<string, string | null>([["s1", "Aluno Um"], ["s2", "Aluno Dois"]]);

  it("inclui aluno, source, severity, title e message já ordenados", () => {
    const rows = [
      row({ student_id: "s2", severity: "info", source: "fatigue", title: "Dados insuficientes", message: "m-info" }),
      row({ student_id: "s1", severity: "critical", source: "checkin_urgent", title: "Atenção prioritária solicitada", message: "m-crit" }),
    ];
    expect(buildOpenAlerts(rows, names)).toEqual([
      { studentName: "Aluno Um", source: "checkin_urgent", severity: "critical", title: "Atenção prioritária solicitada", message: "m-crit" },
      { studentName: "Aluno Dois", source: "fatigue", severity: "info", title: "Dados insuficientes", message: "m-info" },
    ]);
  });

  it("usa 'Aluno' quando o nome não é resolvido", () => {
    expect(buildOpenAlerts([row({ student_id: "desconhecido" })], names)[0].studentName).toBe("Aluno");
    expect(buildOpenAlerts([row({ student_id: null })], names)[0].studentName).toBe("Aluno");
  });

  it("respeita o limite de 10 itens preservando os mais prioritários", () => {
    const rows = [
      ...Array.from({ length: 15 }, (_, i) =>
        row({ severity: "info", title: `info-${i}`, reference_at: `2026-01-${String(i + 1).padStart(2, "0")}T00:00:00Z` }),
      ),
      row({ severity: "critical", title: "critical" }),
    ];
    const alerts = buildOpenAlerts(rows, names);
    expect(AI_QUEUE_LIMIT).toBe(10);
    expect(alerts).toHaveLength(10);
    expect(alerts[0].title).toBe("critical");
  });
});

describe("detalhamento do alerta volume_mrv", () => {
  it("extrai rótulo e séries dos grupos acima do MRV", () => {
    const ctx = { groups: [{ group: "peito", label: "Peito", series: 27 }, { group: "biceps", label: "Bíceps", series: 21.5 }] };
    expect(formatMrvGroups(ctx)).toEqual([
      { label: "Peito", series: 27 },
      { label: "Bíceps", series: 21.5 },
    ]);
  });

  it("retorna vazio para contextos sem grupos", () => {
    expect(formatMrvGroups(null)).toEqual([]);
    expect(formatMrvGroups({})).toEqual([]);
    expect(formatMrvGroups({ groups: "x" })).toEqual([]);
  });
});
