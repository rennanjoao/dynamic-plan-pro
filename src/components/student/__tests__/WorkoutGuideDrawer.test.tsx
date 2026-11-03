/**
 * WorkoutGuideDrawer.test.tsx
 *
 * Cobre o guia das Regras de Ouro: o gatilho abre o guia e as 3 regras
 * aparecem (resumo visível, detalhe só ao tocar), tanto no branch desktop
 * (Dialog) quanto no mobile (Drawer) — a mesma ramificação por useIsMobile()
 * já usada em ExerciseVideoSheet.tsx/MobilitySuggestedDrawer.tsx.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { WorkoutGuideDrawer } from "../WorkoutGuideDrawer";

afterEach(() => cleanup());

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

describe("WorkoutGuideDrawer", () => {
  it("desktop: o gatilho abre um Dialog com as 3 regras", async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    render(<WorkoutGuideDrawer />);

    expect(screen.queryByText(/Série Zero \(aquecimento\)/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /Como ler meu treino/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/Série Zero \(aquecimento\)/)).toBeInTheDocument();
    expect(screen.getByText(/Falha Técnica/)).toBeInTheDocument();
    expect(screen.getByText(/Faltou no treino\?/)).toBeInTheDocument();
  });

  it("mobile: o gatilho abre o Drawer (vaul), não o Dialog, com o mesmo conteúdo", async () => {
    setViewportWidth(390);
    const user = userEvent.setup();
    render(<WorkoutGuideDrawer />);

    await user.click(screen.getByRole("button", { name: /Como ler meu treino/i }));

    await screen.findByText(/Série Zero \(aquecimento\)/);
    // O DrawerContent (vaul) é portalizado pro document.body, assim como o
    // DialogContent — por isso a busca é em document, não no container do
    // render. A "alcinha" de arraste só existe no DrawerContent, nunca no
    // DialogContent — confirma que o branch mobile é mesmo o Drawer.
    expect(document.querySelector(".rounded-t-\\[10px\\]")).not.toBeNull();
  });

  it("não empurra conteúdo: o guia só existe no DOM depois do clique", () => {
    setViewportWidth(1280);
    render(<WorkoutGuideDrawer />);
    expect(screen.queryByText(/Série Zero/)).toBeNull();
  });

  it("revelação progressiva: selos visíveis fechados; detalhe e 'óbvio' só ao tocar", async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    render(<WorkoutGuideDrawer />);
    await user.click(screen.getByRole("button", { name: /Como ler meu treino/i }));

    // Fechado: a essência da regra já está na tela (selos)…
    expect(await screen.findByText("Barra ou 5–10 kg")).toBeInTheDocument();
    expect(screen.getByText("Não conta na ficha")).toBeInTheDocument();
    // …mas o detalhe ainda não.
    expect(screen.queryByText(/1 Série Zero \+ 3 séries valendo/)).toBeNull();

    await user.click(screen.getByRole("button", { name: /Série Zero \(aquecimento\)/ }));
    expect(await screen.findByText(/1 Série Zero \+ 3 séries valendo/)).toBeInTheDocument();
    expect(screen.getByText(/O óbvio que precisa ser dito/i)).toBeInTheDocument();
  });

  it("fidelidade: as regras de falha e de falta mantêm o texto de negócio", async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    render(<WorkoutGuideDrawer />);
    await user.click(screen.getByRole("button", { name: /Como ler meu treino/i }));

    await user.click(await screen.findByRole("button", { name: /Falha Técnica/ }));
    expect(await screen.findByText(/Repetição feia não conta/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Faltou no treino\?/ }));
    expect(await screen.findByText(/não o dia da semana/)).toBeInTheDocument();
    expect(screen.getByText(/amanhã continua sendo dia de Perna/)).toBeInTheDocument();
    expect(screen.getByText(/Dieta de Dia de Descanso/)).toBeInTheDocument();
  });
});
