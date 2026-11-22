import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PublishBar } from "../protocol-builder/PublishBar";

const status = {
  isEditMode: true,
  active: true,
  publishing: false,
  autosaving: false,
  saveStatus: "dirty" as const,
  isDirty: true,
  hasDraft: true,
  lastAutosavedAt: null,
};
const label = { full: "Publicar para o aluno", short: "Publicar" };

describe("PublishBar", () => {
  it("rascunho: status único, lista do que falta e descartar", async () => {
    const onDiscard = vi.fn();
    render(
      <PublishBar
        status={status}
        pendingChanges={[{ category: "dieta", importance: "media", label: "Almoço: arroz 100g → 120g", target_tab: "dieta", target_anchor: null, detail: null } as never]}
        publishLabel={label}
        publishing={false}
        onPublish={vi.fn()}
        onActivate={vi.fn()}
        onDiscardDraft={onDiscard}
      />,
    );
    expect(screen.getByTestId("publish-status").textContent).toBe("Rascunho — o aluno ainda NÃO vê 1 alteração");
    await userEvent.click(screen.getByTitle("Ver o que o aluno ainda não vê"));
    expect(await screen.findByText("Almoço: arroz 100g → 120g")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Descartar rascunho" }));
    expect(onDiscard).toHaveBeenCalled();
  });

  it("inativo: mostra 'Ativar' e o publicar continua clicável (explica o motivo)", async () => {
    const onActivate = vi.fn();
    const onPublish = vi.fn();
    render(
      <PublishBar
        status={{ ...status, active: false }}
        pendingChanges={[]}
        publishLabel={label}
        publishing={false}
        onPublish={onPublish}
        onActivate={onActivate}
      />,
    );
    expect(screen.getByTestId("publish-status").textContent).toMatch(/Inativo — o aluno não vê este protocolo/);
    await userEvent.click(screen.getByTestId("publish-bar-activate"));
    expect(onActivate).toHaveBeenCalled();
    await userEvent.click(screen.getByTestId("publish-button"));
    expect(onPublish).toHaveBeenCalled();
  });
});
