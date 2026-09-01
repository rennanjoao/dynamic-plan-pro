/**
 * WorkoutGuideDrawer.test.tsx
 *
 * Cobre a MISSÃO 2: o gatilho abre o guia e o conteúdo das 4 regras
 * aparece, tanto no branch desktop (Dialog) quanto no branch mobile
 * (Drawer) — a mesma ramificação por useIsMobile() já usada em
 * ExerciseVideoSheet.tsx/MobilitySuggestedDrawer.tsx.
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
  it("desktop: o gatilho abre um Dialog com as 4 regras", async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    render(<WorkoutGuideDrawer />);

    expect(screen.queryByText(/O Primeiro Aquecimento/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /Como ler meu treino/i }));

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/O Primeiro Aquecimento/)).toBeInTheDocument();
    expect(screen.getByText(/A Regra do "2\+2"/)).toBeInTheDocument();
    expect(screen.getByText(/Ir até a Falha/)).toBeInTheDocument();
    expect(screen.getByText(/Faltou no treino/)).toBeInTheDocument();
  });

  it("mobile: o gatilho abre o Drawer (vaul), não o Dialog, com o mesmo conteúdo", async () => {
    setViewportWidth(390);
    const user = userEvent.setup();
    render(<WorkoutGuideDrawer />);

    await user.click(screen.getByRole("button", { name: /Como ler meu treino/i }));

    await screen.findByText(/O Primeiro Aquecimento/);
    expect(screen.getByText(/A Regra do "2\+2"/)).toBeInTheDocument();
    // O DrawerContent (vaul) é portalizado pro document.body, assim como o
    // DialogContent — por isso a busca é em document, não no container do
    // render. A "alcinha" de arraste só existe no DrawerContent, nunca no
    // DialogContent — confirma que o branch mobile é mesmo o Drawer.
    expect(document.querySelector(".rounded-t-\\[10px\\]")).not.toBeNull();
  });

  it("não empurra conteúdo: o texto completo só existe no DOM depois do clique", () => {
    setViewportWidth(1280);
    render(<WorkoutGuideDrawer />);
    expect(screen.queryByText(/Hard Sets/)).toBeNull();
  });
});
