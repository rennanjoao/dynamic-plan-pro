import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { CycleSummaryData } from "@/hooks/useStudentCycleSummary";

const h = vi.hoisted(() => ({ data: null as unknown }));
vi.mock("@/hooks/useStudentCycleSummary", () => ({
  useStudentCycleSummary: () => ({ data: h.data, isLoading: false, error: null }),
}));

import StudentCycleSummary from "../StudentCycleSummary";

const daysAgo = (n: number, hour = 8) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const ymd = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function base(): CycleSummaryData {
  return {
    protocol: {
      id: "p1", name: "Ciclo Nov",
      payload: {
        workouts: ["A", "B", "C", "D"].map((key) => ({ key, exercises: [{ name: "Agachamento", is_mobility: false }] })),
        weekDays: {},
        meals: [{ day_type: "all" }, { day_type: "all" }, { day_type: "all" }, { day_type: "all" }, { day_type: "rest" }],
        periodization: { enabled: true, weeks: [{ label: "S1" }, { label: "S2 — Qualidade" }, { label: "S3" }, { label: "S4" }] },
      },
      createdAt: daysAgo(21), updatedAt: daysAgo(21), firstViewedAt: daysAgo(8),
    },
    sessions: [],
    meals: [
      { date: ymd(1), meal_index: 0, checked: true },
      { date: ymd(1), meal_index: 1, checked: true },
      { date: ymd(2), meal_index: 0, checked: true },
    ],
    lastCheckin: { id: "c1", submittedAt: daysAgo(2), answered: false, readByStudent: false },
    notes: [{ sessionId: "x", date: daysAgo(3), workoutLabel: "Treino A", note: "Senti o joelho" }],
    feel: [
      { exercise_key: "hip_thrust", exercise_name: "Hip Thrust", felt: "lombar", created_at: daysAgo(1) },
      { exercise_key: "hip_thrust", exercise_name: "Hip Thrust", felt: "lombar", created_at: daysAgo(4) },
      { exercise_key: "hip_thrust", exercise_name: "Hip Thrust", felt: "gluteo", created_at: daysAgo(8) },
      { exercise_key: "stiff", exercise_name: "Stiff", felt: "posterior", created_at: daysAgo(2) },
      { exercise_key: "stiff", exercise_name: "Stiff", felt: "posterior", created_at: daysAgo(6) },
    ],
  };
}

const renderIt = (onReply = vi.fn()) =>
  render(<StudentCycleSummary studentId="s1" onReply={onReply} onEditProtocol={vi.fn()} onPreviewProtocol={vi.fn()} />);

describe("Resumo do ciclo (ficha do aluno)", () => {
  beforeEach(() => { h.data = base(); });

  it("mostra há quanto tempo o protocolo está publicado e a semana da periodização", () => {
    renderIt();
    expect(screen.getByTestId("summary-protocol")).toHaveTextContent("há 3 semanas");
    expect(screen.getByTestId("summary-periodization")).toHaveTextContent("Semana 2 de 4");
    expect(screen.getByTestId("summary-periodization")).toHaveTextContent("S2 — Qualidade");
  });

  it("adesão real: sem treinos registrados nas últimas semanas = 0 de 12 (não 100%)", () => {
    renderIt();
    expect(screen.getByTestId("summary-adherence-pct")).toHaveTextContent("0 de 12 (0%)");
    expect(screen.getByText(/Previsto: 4 treinos por semana/)).toBeTruthy();
  });

  it("check-in sem resposta: botão Responder agora chama o painel", async () => {
    const onReply = vi.fn();
    renderIt(onReply);
    expect(screen.getByText("Aguardando sua resposta")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Responder agora/ }));
    expect(onReply).toHaveBeenCalled();
  });

  it("check-in respondido mostra se a aluna já viu", () => {
    h.data = { ...base(), lastCheckin: { id: "c1", submittedAt: daysAgo(2), answered: true, readByStudent: true } };
    renderIt();
    expect(screen.getByTestId("summary-checkin")).toHaveTextContent("Respondido · aluna já viu");
  });

  it("refeições marcadas e recados da aluna aparecem", () => {
    renderIt();
    expect(screen.getByTestId("summary-diet")).toHaveTextContent("2 dos últimos 7 dias");
    expect(screen.getByTestId("summary-diet")).toHaveTextContent("o plano tem 4");
    expect(screen.getByTestId("summary-notes")).toHaveTextContent("Senti o joelho");
  });

  it("onde a aluna sente: lombar dominando o hip thrust gera a dica do manual; posterior no stiff é esperado", () => {
    renderIt();
    const hip = screen.getByTestId("feel-hip_thrust");
    expect(hip).toHaveTextContent("Lombar 2");
    expect(hip).toHaveTextContent("Lombar dominando.");
    expect(hip).toHaveTextContent("expirar na subida");
    const stiff = screen.getByTestId("feel-stiff");
    expect(stiff).toHaveTextContent("Posterior 2");
    expect(stiff).not.toHaveTextContent("dominando");
  });

  it("sem a tabela no banco, o cartão de 'onde sente' não aparece", () => {
    h.data = { ...base(), feel: null };
    renderIt();
    expect(screen.queryByTestId("summary-feel")).toBeNull();
  });

  it("aluna que ainda não abriu o protocolo fica sinalizada", () => {
    const d = base();
    d.protocol!.firstViewedAt = null;
    h.data = d;
    renderIt();
    expect(screen.getByText("A aluna ainda não abriu este protocolo.")).toBeTruthy();
  });
});
