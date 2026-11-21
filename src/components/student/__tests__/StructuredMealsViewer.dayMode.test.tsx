import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "aluna-1" } } } }) } },
}));
vi.mock("@/hooks/useMealCheckins", () => ({ useMealCheckins: () => ({ checked: {}, toggle: vi.fn() }) }));
const busy = vi.hoisted(() => ({ value: undefined as unknown }));
vi.mock("@/hooks/useBusyWeek", () => ({ useStudentBusyWeek: () => ({ data: busy.value }) }));

import StructuredMealsViewer from "../StructuredMealsViewer";
import { todayKey } from "@/lib/weekCycle";

const food = (name: string, weight: string) => ({ name, weight });
const opt = (kind: string, items: unknown[]) => ({ kind, title: "Opção 1", items });
const meal = (name: string, extra: Record<string, unknown> = {}) => ({
  name, time: "12:00", macros: { carbs: 50, protein: 30, fat: 10 },
  options: [opt("carb", [food("Arroz", "100g")]), opt("protein", [food("Frango", "120g")])],
  carbCycle: true, ...extra,
});

function payload(trainingToday: boolean) {
  const t = todayKey();
  return {
    setup: { carbCycle: true },
    weekDays: trainingToday ? { [t]: "A" } : {},
    carbCycle: { [t]: "high" },
    workouts: [{ key: "A", focus: "Pernas", exercises: [] }],
    meals: [
      meal("Café da manhã"),
      meal("Pré-treino", { day_type: "training", pairId: "p1" }),
      meal("Lanche do descanso", { day_type: "rest", pairId: "p1" }),
    ],
  };
}

beforeEach(() => { localStorage.clear(); busy.value = undefined; });
afterEach(() => cleanup());

describe("Dieta — 'Hoje não vou treinar'", () => {
  it("troca a refeição em par para descanso, baixa o carbo e lembra só hoje", async () => {
    const first = render(<StructuredMealsViewer payload={payload(true)} />);
    expect(screen.getByText("Pré-treino")).toBeTruthy();
    expect(screen.queryByText("Lanche do descanso")).toBeNull();
    expect(within(screen.getByText("Hoje · Carbo").parentElement as HTMLElement).getByText("Alto")).toBeTruthy();

    await userEvent.click(await screen.findByRole("button", { name: "Hoje não vou treinar" }));
    expect(screen.getByText("Lanche do descanso")).toBeTruthy();
    expect(screen.queryByText("Pré-treino")).toBeNull();
    expect(screen.getByText(/hoje sem treino/i)).toBeTruthy();
    // card do dia mostra o carbo efetivo
    expect(within(screen.getByText("Hoje · Carbo").parentElement as HTMLElement).getByText("Baixo")).toBeTruthy();
    // refeição sem par continua
    expect(screen.getByText("Café da manhã")).toBeTruthy();

    // reabrir o app no mesmo dia mantém
    first.unmount();
    render(<StructuredMealsViewer payload={payload(true)} />);
    expect(await screen.findByText("Lanche do descanso")).toBeTruthy();

    // desfazer volta ao planejado
    await userEvent.click(screen.getByRole("button", { name: "Desfazer" }));
    expect(screen.getByText("Pré-treino")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hoje não vou treinar" })).toBeTruthy();
  });

  it("dia de descanso: 'Hoje vou treinar' troca só as refeições, carbo continua", async () => {
    render(<StructuredMealsViewer payload={payload(false)} />);
    expect(screen.getByText("Lanche do descanso")).toBeTruthy();
    await userEvent.click(await screen.findByRole("button", { name: "Hoje vou treinar" }));
    expect(screen.getByText("Pré-treino")).toBeTruthy();
    expect(screen.queryByText("Lanche do descanso")).toBeNull();
    expect(within(screen.getByText("Hoje · Carbo").parentElement as HTMLElement).getByText("Alto")).toBeTruthy();
  });

  it("sem tocar em nada, nada muda (não infere descanso)", async () => {
    render(<StructuredMealsViewer payload={payload(true)} />);
    await screen.findByRole("button", { name: "Hoje não vou treinar" });
    expect(screen.getByText("Pré-treino")).toBeTruthy();
    expect(localStorage.length === 0 || !Object.keys(localStorage).some((k) => k.startsWith("diet_day_override_"))).toBe(true);
  });

  it("lembra Cru/Cozido da aluna ao reabrir", async () => {
    const first = render(<StructuredMealsViewer payload={payload(true)} />);
    await screen.findByRole("button", { name: "Hoje não vou treinar" });
    await userEvent.click(screen.getByRole("button", { name: "Cozido" }));
    expect(screen.getByRole("button", { name: "Cozido" }).getAttribute("aria-pressed")).toBe("true");
    first.unmount();
    render(<StructuredMealsViewer payload={payload(true)} />);
    await screen.findByRole("button", { name: "Hoje não vou treinar" });
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Cozido" }).getAttribute("aria-pressed")).toBe("true"));
  });

  it("mostra a meta de água definida pelo coach", async () => {
    const p = { ...payload(true), macros: { water: 2.5 } };
    render(<StructuredMealsViewer payload={p} />);
    expect((await screen.findByTestId("water-target")).textContent).toContain("2,5 litros");
  });

  it("sem meta de água não mostra nada", async () => {
    render(<StructuredMealsViewer payload={payload(true)} />);
    await screen.findByRole("button", { name: "Hoje não vou treinar" });
    expect(screen.queryByTestId("water-target")).toBeNull();
  });

  it("marcar refeição tem área de toque de 44px", async () => {
    render(<StructuredMealsViewer payload={payload(true)} />);
    const box = (await screen.findAllByRole("checkbox"))[0];
    expect(box.className).toContain("w-11");
    expect(box.className).toContain("h-11");
  });

  describe("Semana Corrida", () => {
    // Plano secundário com a faixa da semana própria (dias + carbo), como no treino atual.
    const busyOn = (todayIsTraining: boolean, carb: "high" | "base" | "off") => {
      const t = todayKey();
      return {
        active: true,
        sessions: [],
        assignment: {
          payload: {
            workouts: [{ key: "SC_A", focus: "Full Body A", exercises: [] }],
            weekDays: { [t]: todayIsTraining ? "SC_A" : "REST" },
            carbCycle: { [t]: carb },
          },
        },
      };
    };

    it("dia de descanso na semana do plano: refeições de descanso e carbo do plano, mesmo com treino no protocolo", async () => {
      busy.value = busyOn(false, "off");
      render(<StructuredMealsViewer payload={payload(true)} />);
      expect(screen.getByTestId("busy-diet-week")).toBeTruthy();
      expect(screen.getByText("Lanche do descanso")).toBeTruthy();
      expect(screen.queryByText("Pré-treino")).toBeNull();
      expect(within(screen.getByText("Hoje · Carbo").parentElement as HTMLElement).getByText("Baixo")).toBeTruthy();
    });

    it("dia de treino na semana do plano: mostra a letra do treino e os mesmos botões do dia a dia", async () => {
      busy.value = busyOn(true, "high");
      render(<StructuredMealsViewer payload={payload(false)} />);
      expect(screen.getByText("Pré-treino")).toBeTruthy();
      expect(within(screen.getByText("Hoje · Carbo").parentElement as HTMLElement).getByText("Alto")).toBeTruthy();
      expect(screen.queryByText(/SC_A/)).toBeNull();
      await userEvent.click(await screen.findByRole("button", { name: "Hoje não vou treinar" }));
      expect(screen.getByText("Lanche do descanso")).toBeTruthy();
    });

    it("Semana Corrida desligada: segue o protocolo normal", async () => {
      busy.value = { ...busyOn(false, "off"), active: false };
      render(<StructuredMealsViewer payload={payload(true)} />);
      expect(screen.queryByTestId("busy-diet-week")).toBeNull();
      expect(screen.getByText("Pré-treino")).toBeTruthy();
    });
  });
});
