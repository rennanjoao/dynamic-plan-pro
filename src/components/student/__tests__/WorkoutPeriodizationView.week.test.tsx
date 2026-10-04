import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import WorkoutPeriodizationView from "../WorkoutPeriodizationView";
import { DEFAULT_WEEKS } from "@/lib/periodizationDefaults";

const periodization = { enabled: true, weeks: DEFAULT_WEEKS };
const isActive = (name: string) => screen.getByRole("button", { name }).className.includes("bg-primary");

describe("WorkoutPeriodizationView — semana selecionada", () => {
  it("sem controle do pai continua guardando a escolha sozinho (comportamento antigo)", () => {
    render(<WorkoutPeriodizationView workouts={[]} periodization={periodization} initialWeek={1} renderLegacy={() => null} />);
    expect(isActive("Semana 2")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Semana 4" }));
    expect(isActive("Semana 4")).toBe(true);
    expect(isActive("Semana 2")).toBe(false);
  });

  it("controlado: mostra a semana do pai e avisa quando o aluno toca em outra", () => {
    const onChange = vi.fn();
    render(<WorkoutPeriodizationView workouts={[]} periodization={periodization} selectedWeek={2} onActiveWeekChange={onChange} renderLegacy={() => null} />);
    expect(isActive("Semana 3")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Semana 1" }));
    expect(onChange).toHaveBeenCalledWith(0);
    // o pai não mudou `selectedWeek`, então a tela continua na semana dele
    expect(isActive("Semana 3")).toBe(true);
  });

  it("controlado: acompanha o pai quando a semana atual do sistema muda sem escolha manual", () => {
    const Host = () => {
      const [week, setWeek] = useState(0);
      return <>
        <button type="button" onClick={() => setWeek(1)}>sistema avança</button>
        <WorkoutPeriodizationView workouts={[]} periodization={periodization} selectedWeek={week} renderLegacy={() => null} />
      </>;
    };
    render(<Host />);
    expect(isActive("Semana 1")).toBe(true);
    fireEvent.click(screen.getByText("sistema avança"));
    expect(isActive("Semana 2")).toBe(true);
  });
});
