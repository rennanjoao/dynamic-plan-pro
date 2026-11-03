/**
 * PeriodizationGuideDrawer.test.tsx
 *
 * Cobre: abertura em "Semanas", destaque "Você está aqui" na semana ativa,
 * demais semanas recolhidas, deload, navegação entre abas e a fidelidade das
 * regras de negócio (cargas diferentes por semana, progressão da Força).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { PeriodizationGuideDrawer } from "../PeriodizationGuideDrawer";
import type { PhaseKey } from "@/lib/periodizationCopy";

afterEach(() => cleanup());

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

async function openGuide(currentPhase: PhaseKey | "deload" | null, width = 1280) {
  setViewportWidth(width);
  const user = userEvent.setup();
  render(
    <PeriodizationGuideDrawer
      currentPhase={currentPhase}
      trigger={<button type="button">abrir guia</button>}
    />,
  );
  await user.click(screen.getByRole("button", { name: "abrir guia" }));
  await screen.findByRole("tablist");
  return user;
}

describe("PeriodizationGuideDrawer", () => {
  it("abre na aba Semanas com a semana ativa em destaque e o aviso de cargas diferentes", async () => {
    await openGuide("pump");

    expect(screen.getByRole("tab", { name: /Semanas/ })).toHaveAttribute("data-state", "active");
    expect(screen.getByText(/NÃO vai usar o mesmo peso em todas as semanas/)).toBeInTheDocument();

    const hero = screen.getByRole("region", { name: /Semana de Pump — Você está aqui/ });
    expect(within(hero).getByText("Você está aqui")).toBeInTheDocument();
    expect(within(hero).getByText(/Esqueça a carga da Semana de Força/)).toBeInTheDocument();
    expect(within(hero).getByText(/Erro clássico/)).toBeInTheDocument();
  });

  it("as outras semanas ficam recolhidas (regra de uma semana não vaza para a outra)", async () => {
    const user = await openGuide("pump");

    // Fechadas: só o título aparece; o conteúdo da Força não está no DOM.
    expect(screen.getByRole("button", { name: /Semana de Força/ })).toBeInTheDocument();
    expect(screen.queryByText(/Estragar a postura só para completar/)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Semana de Força/ }));
    expect(await screen.findByText(/Estragar a postura só para completar/)).toBeInTheDocument();
    expect(screen.getByText(/Esta não é a sua semana agora/)).toBeInTheDocument();
  });

  it("Qualidade e Pump mostram que o peso deve ser menor que na Força", async () => {
    await openGuide("forca");
    expect(screen.getAllByText(/menos que na Força/)).toHaveLength(2);
  });

  it("semana de deload: destaca o deload e deixa as 3 fases recolhidas", async () => {
    await openGuide("deload");
    expect(screen.getByRole("region", { name: /Semana de Deload — Você está aqui/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Semana de Força/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Semana de Qualidade/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Semana de Pump/ })).toBeInTheDocument();
  });

  it("aba Subir carga (semana de Força): passo a passo + timeline Treino 1 → 4", async () => {
    const user = await openGuide("forca");
    await user.click(screen.getByRole("tab", { name: /Subir carga/ }));

    expect(await screen.findByText(/Quem define se você sobe o peso é sempre a última série/)).toBeInTheDocument();
    expect(screen.getByText("Encontre a carga")).toBeInTheDocument();
    expect(screen.getByText("Conquiste o topo")).toBeInTheDocument();
    expect(screen.getByText("Suba o peso")).toBeInTheDocument();
    expect(screen.getByText(/\+1 kg a \+5 kg/)).toBeInTheDocument();
    expect(screen.getByText(/Você não para no 5 porque quer/)).toBeInTheDocument();
    expect(screen.getByText(/travar entre 5 e 6/)).toBeInTheDocument();

    for (const label of ["Treino 1", "Treino 2", "Treino 3", "Treino 4"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Fez 8 limpas!")).toBeInTheDocument();
    expect(screen.getByText(/Exemplo com faixa de 5 a 8 repetições/)).toBeInTheDocument();
    expect(screen.getByText("32 ou 35 kg")).toBeInTheDocument();

    expect(screen.getByText(/Fez 8 roubando nas últimas\? Mantenha o peso/)).toBeInTheDocument();
    expect(screen.getByText(/não travar abaixo de 5/)).toBeInTheDocument();
  });

  it("aba Subir carga em Pump: a regra do Pump vem primeiro e a da Força fica recolhida", async () => {
    const user = await openGuide("pump");
    await user.click(screen.getByRole("tab", { name: /Subir carga/ }));

    expect(await screen.findByText(/sem sentir queimar/)).toBeInTheDocument();
    expect(screen.getByText(/descansar mais tempo do que pede a ficha/)).toBeInTheDocument();
    // Regra completa da Força recolhida: o stepper não está no DOM.
    expect(screen.queryByText("Conquiste o topo")).toBeNull();
  });

  it("botão da semana ativa leva para a aba Subir carga", async () => {
    const user = await openGuide("forca");
    await user.click(screen.getByRole("button", { name: /Ver como subir a carga/ }));
    expect(screen.getByRole("tab", { name: /Subir carga/ })).toHaveAttribute("data-state", "active");
  });

  it("aba Regras traz as 3 regras de ouro", async () => {
    const user = await openGuide("qualidade");
    await user.click(screen.getByRole("tab", { name: /Regras/ }));
    expect(await screen.findByText(/Série Zero \(aquecimento\)/)).toBeInTheDocument();
    expect(screen.getByText(/Falha Técnica/)).toBeInTheDocument();
    expect(screen.getByText(/Faltou no treino\?/)).toBeInTheDocument();
  });

  it("mobile: abre como Drawer com as 3 abas", async () => {
    await openGuide("forca", 390);
    expect(document.querySelector(".rounded-t-\\[10px\\]")).not.toBeNull();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });
});
