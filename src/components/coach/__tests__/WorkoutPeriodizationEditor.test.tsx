/**
 * WorkoutPeriodizationEditor.test.tsx
 *
 * Cobre a correção da MISSÃO 1 (auditoria de bugs na periodização):
 *
 *   1. duas edições de texto livre em exercícios DIFERENTES da mesma
 *      semana, seguidas de UM ÚNICO clique em "Salvar Alterações da
 *      Semana", persistem as DUAS no payload — a garantia central de que
 *      consolidar tudo num só commit elimina a corrida de estado que
 *      existia com um botão "Aplicar" por linha (cada um fechando sobre o
 *      payload do seu próprio render).
 *   2. quando o payload muda "por fora" do rascunho desta tela (aqui via
 *      "Resetar padrão", que é o caminho mais simples de testar em jsdom —
 *      mesmo mecanismo de resincronização usado por "Copiar de outra
 *      semana"), o rascunho local da semana afetada é resincronizado: o
 *      campo volta a ficar vazio na tela, não só no payload. Sem essa
 *      resincronização por referência, o input continuaria mostrando o
 *      valor antigo mesmo depois do reset.
 *   3. "Aplicar em massa" (bulk) e uma edição pendente ainda não salva no
 *      mesmo exercício coexistem no rascunho e sobrevivem juntas a UM
 *      "Salvar Alterações da Semana" — prova de que o bulk deixou de
 *      gravar direto no payload (o que apagaria silenciosamente edições
 *      de linha ainda não salvas na mesma semana).
 */
import { describe, it, expect } from "vitest";
import { useState } from "react";
import { render, screen, within, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach } from "vitest";

import WorkoutPeriodizationEditor from "../WorkoutPeriodizationEditor";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { ProtocolPayloadSchema, type ProtocolPayload } from "@/lib/protocolSchema";

afterEach(() => cleanup());

function buildPayload(): ProtocolPayload {
  return ProtocolPayloadSchema.parse({
    setup: {},
    workouts: [
      {
        key: "A",
        focus: "Peito/Tríceps",
        exercises: [
          { name: "Supino Reto", sets: "3", reps: "8-12" },
          { name: "Tríceps Corda", sets: "3", reps: "10-15" },
        ],
      },
    ],
    periodization: { enabled: true },
  });
}

function Harness({ onPayload }: { onPayload: (p: ProtocolPayload) => void }) {
  const [payload, setPayload] = useState<ProtocolPayload>(buildPayload);
  const update = (p: ProtocolPayload) => {
    setPayload(p);
    onPayload(p);
  };
  return (
    <ConfirmProvider>
      <WorkoutPeriodizationEditor payload={payload} setPayload={update} coachId="coach-1" />
    </ConfirmProvider>
  );
}

// A única div com a classe "space-y-2" no componente é o card da semana —
// serve pra escopar consultas a "essa semana" e não a todas as 4 de uma vez.
function weekCardByLabel(labelText: string) {
  const labelInput = screen.getByDisplayValue(labelText);
  const card = labelInput.closest("div.space-y-2");
  if (!card) throw new Error(`week card not found for "${labelText}"`);
  return within(card as HTMLElement);
}

describe("WorkoutPeriodizationEditor — rascunho único + salvar por semana", () => {
  it("duas edições em exercícios diferentes sobrevivem a um único Salvar (corrige a corrida de estado)", async () => {
    const user = userEvent.setup();
    let latest: ProtocolPayload | null = null;
    render(<Harness onPayload={(p) => (latest = p)} />);

    const week1 = weekCardByLabel("Semana 1 — Carga Máxima");
    await user.click(week1.getByRole("button", { name: /Substituições Específicas/i }));

    const repsInputs = week1.getAllByPlaceholderText("reps");
    const restInputs = week1.getAllByPlaceholderText("descanso");
    expect(repsInputs).toHaveLength(2);

    await user.type(repsInputs[0], "12"); // Supino Reto
    await user.type(restInputs[1], "90s"); // Tríceps Corda

    const saveBtn = week1.getByRole("button", { name: /Salvar Alterações da Semana/i });
    expect(saveBtn).toBeEnabled();
    await user.click(saveBtn);

    expect(latest).not.toBeNull();
    const overrides = latest!.periodization.overrides?.["0"] || {};
    expect(overrides["A_0"]?.reps).toBe("12");
    expect(overrides["A_1"]?.rest).toBe("90s");
  });

  it("resincroniza o rascunho quando o payload muda por fora (Resetar padrão)", async () => {
    const user = userEvent.setup();
    let latest: ProtocolPayload | null = null;
    render(<Harness onPayload={(p) => (latest = p)} />);

    const week1 = weekCardByLabel("Semana 1 — Carga Máxima");
    await user.click(week1.getByRole("button", { name: /Substituições Específicas/i }));

    const repsInputs = week1.getAllByPlaceholderText("reps");
    await user.type(repsInputs[0], "20");
    await user.click(week1.getByRole("button", { name: /Salvar Alterações da Semana/i }));

    expect(latest!.periodization.overrides?.["0"]?.["A_0"]?.reps).toBe("20");
    // Input reflete o valor salvo (o próprio Salvar também passa pela
    // resincronização — precisa ser um no-op visual, não só no payload).
    expect((week1.getAllByPlaceholderText("reps")[0] as HTMLInputElement).value).toBe("20");

    // Semana está "limpa" (rascunho == payload) logo após salvar, então
    // Resetar padrão não deve pedir confirmação.
    await user.click(week1.getByTitle("Resetar padrão"));
    expect(screen.queryByRole("alertdialog")).toBeNull();

    expect(latest!.periodization.overrides?.["0"]).toBeUndefined();
    // O campo precisa voltar a ficar vazio NA TELA, não só no payload —
    // sem a resincronização por referência, o input ficaria travado no "20".
    expect((week1.getAllByPlaceholderText("reps")[0] as HTMLInputElement).value).toBe("");
  });

  it("Resetar padrão pede confirmação quando há rascunho não salvo na semana", async () => {
    const user = userEvent.setup();
    render(<Harness onPayload={() => {}} />);

    const week1 = weekCardByLabel("Semana 1 — Carga Máxima");
    await user.click(week1.getByRole("button", { name: /Substituições Específicas/i }));
    await user.type(week1.getAllByPlaceholderText("reps")[0], "20"); // não salvo

    await user.click(week1.getByTitle("Resetar padrão"));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("Aplicar em massa + edição pendente no mesmo exercício sobrevivem juntas a um Salvar", async () => {
    const user = userEvent.setup();
    let latest: ProtocolPayload | null = null;
    render(<Harness onPayload={(p) => (latest = p)} />);

    const week1 = weekCardByLabel("Semana 1 — Carga Máxima");
    await user.click(week1.getByRole("button", { name: /Substituições Específicas/i }));

    // Edição de linha ainda não salva no exercício 0 (Supino Reto).
    await user.type(week1.getAllByPlaceholderText("séries")[0], "5");

    // Aplicar em massa "Descanso = 45s" pra semana inteira.
    await user.click(week1.getByRole("button", { name: /Aplicar em massa/i }));
    await user.click(screen.getByRole("button", { name: "Descanso" }));
    await user.type(screen.getByPlaceholderText("Ex: 60s"), "45s");
    await user.click(screen.getByRole("button", { name: /Aplicar em todos os exercícios/i }));

    await user.click(week1.getByRole("button", { name: /Salvar Alterações da Semana/i }));

    const overrides = latest!.periodization.overrides?.["0"] || {};
    expect(overrides["A_0"]?.sets).toBe("5"); // sobreviveu ao bulk
    expect(overrides["A_0"]?.rest).toBe("45s");
    expect(overrides["A_1"]?.rest).toBe("45s");
  });
});
