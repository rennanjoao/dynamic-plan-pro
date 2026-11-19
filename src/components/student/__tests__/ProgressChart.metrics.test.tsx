import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/useStudentData", () => ({
  useStudentData: () => ({
    loading: false,
    goal: "emagrecer",
    anamnesis: { submitted_at: "2026-01-05T12:00:00Z", baseline_metrics: { peso: 80, cintura: 90, altura: 165 }, payload: { gender: "F" } },
    checkIns: [
      // respondido/editado depois: o ponto continua na data de envio
      { submitted_at: "2026-02-02T12:00:00Z", updated_at: "2026-04-01T12:00:00Z", current_metrics: { peso: 77.5, cintura: 86 } },
    ],
  }),
}));

import { ProgressChart } from "../ProgressChart";

describe("gráfico de evolução — medidas", () => {
  it("variação de peso desde a anamnese e troca para cintura", async () => {
    render(<ProgressChart studentId="s1" />);
    expect(screen.getByTestId("progress-delta")).toHaveTextContent("-2.5 kg");
    expect(screen.getByText("desde a anamnese")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Cintura" }));
    expect(screen.getByTestId("progress-delta")).toHaveTextContent("-4.0 cm");
    expect(screen.getByText("Mudança de Cintura")).toBeTruthy();
  });

  it("medida ainda não registrada mostra aviso em vez de gráfico vazio", async () => {
    render(<ProgressChart studentId="s1" />);
    await userEvent.click(screen.getByRole("button", { name: "Braço" }));
    expect(screen.getByText("Ainda não há medida de braço registrada.")).toBeTruthy();
  });
});
