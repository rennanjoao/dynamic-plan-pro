/**
 * WhatsNewHost.test.tsx — aviso automático de novidades na área do aluno.
 *
 * Cobre: nada a mostrar; exibição + marcação de "visto" na exibição; navegação
 * entre slides; botão "Ver agora" (rota interna validada); desligado no Modo
 * Espelho; falha da API não derruba nada; branch mobile usa o Drawer (vaul).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const fetchPending = vi.fn();
const markSeen = vi.fn();
const navigateMock = vi.fn();

vi.mock("@/hooks/useWhatsNew", () => ({
  fetchPendingAnnouncements: (...a: unknown[]) => fetchPending(...a),
  markAnnouncementsSeen: (...a: unknown[]) => markSeen(...a),
  useAnnouncementHistory: () => ({ data: [], isLoading: false }),
}));
vi.mock("react-router-dom", async (orig) => ({
  ...(await orig<typeof import("react-router-dom")>()),
  useNavigate: () => navigateMock,
}));
// Sem animação de saída nos testes (troca de slide imediata).
vi.mock("framer-motion", async (orig) => ({
  ...(await orig<typeof import("framer-motion")>()),
  useReducedMotion: () => true,
}));

import { WhatsNewHost } from "../WhatsNewHost";

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

const announcement = (id: string, slides: unknown) => ({
  id, slug: id, title: id, audience: "student", slides, is_active: true,
  published_at: "2026-10-27T12:00:00Z", expires_at: null,
  created_at: "2026-10-27T12:00:00Z", updated_at: "2026-10-27T12:00:00Z",
});

const TWO_SLIDES = [
  { icon: "heart", title: "S.O.S TPM novo", body: "Texto um", cta: { label: "Abrir o S.O.S TPM", route: "/routine?highlight=tool-tpm" } },
  { icon: "book-open", title: "Guia do treino", body: "Texto dois" },
];

beforeEach(() => {
  setViewportWidth(1280);
  fetchPending.mockReset();
  markSeen.mockReset().mockResolvedValue(undefined);
  navigateMock.mockReset();
});
afterEach(() => cleanup());

describe("WhatsNewHost", () => {
  it("não mostra nada e não marca nada quando não há pendências", async () => {
    fetchPending.mockResolvedValue([]);
    render(<WhatsNewHost enabled />);
    await waitFor(() => expect(fetchPending).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(markSeen).not.toHaveBeenCalled();
  });

  it("mostra o aviso, marca como visto na EXIBIÇÃO e percorre os slides até 'Entendi'", async () => {
    fetchPending.mockResolvedValue([announcement("a1", TWO_SLIDES)]);
    const user = userEvent.setup();
    render(<WhatsNewHost enabled />);

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("S.O.S TPM novo")).toBeInTheDocument();
    expect(markSeen).toHaveBeenCalledWith(["a1"]);

    await user.click(screen.getByRole("button", { name: "Próximo" }));
    expect(await screen.findByText("Guia do treino")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Voltar" }));
    expect(await screen.findByText("S.O.S TPM novo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Próximo" }));
    await user.click(await screen.findByRole("button", { name: "Entendi" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(markSeen).toHaveBeenCalledTimes(1);
  });

  it("junta os slides de vários avisos e marca todos os ids", async () => {
    fetchPending.mockResolvedValue([
      announcement("a1", [{ title: "Primeiro", body: "x" }]),
      announcement("a2", [{ title: "Segundo", body: "y" }]),
    ]);
    const user = userEvent.setup();
    render(<WhatsNewHost enabled />);
    expect(await screen.findByText("Primeiro")).toBeInTheDocument();
    expect(markSeen).toHaveBeenCalledWith(["a1", "a2"]);
    await user.click(screen.getByRole("button", { name: "Próximo" }));
    expect(await screen.findByText("Segundo")).toBeInTheDocument();
  });

  it("o botão do slide fecha o aviso e navega para a rota interna", async () => {
    fetchPending.mockResolvedValue([announcement("a1", TWO_SLIDES)]);
    const user = userEvent.setup();
    render(<WhatsNewHost enabled />);
    await user.click(await screen.findByRole("button", { name: "Abrir o S.O.S TPM" }));
    expect(navigateMock).toHaveBeenCalledWith("/routine?highlight=tool-tpm");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("não renderiza botão quando a rota é externa (conteúdo adulterado)", async () => {
    fetchPending.mockResolvedValue([
      announcement("a1", [{ title: "Ruim", body: "x", cta: { label: "Clique", route: "https://evil.com" } }]),
    ]);
    render(<WhatsNewHost enabled />);
    expect(await screen.findByText("Ruim")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clique" })).toBeNull();
  });

  it("desligado (Modo Espelho): não consulta nem marca nada", async () => {
    render(<WhatsNewHost enabled={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(fetchPending).not.toHaveBeenCalled();
    expect(markSeen).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("aviso sem nenhum slide válido é marcado como visto mas não abre nada", async () => {
    fetchPending.mockResolvedValue([announcement("quebrado", [{ title: "", body: "" }])]);
    render(<WhatsNewHost enabled />);
    await waitFor(() => expect(markSeen).toHaveBeenCalledWith(["quebrado"]));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("erro na consulta (ex.: migração ainda não aplicada) é silencioso", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchPending.mockRejectedValue(new Error("function does not exist"));
    render(<WhatsNewHost enabled />);
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(screen.queryByRole("dialog")).toBeNull();
    warn.mockRestore();
  });

  it("mobile: usa o Drawer (vaul), não o Dialog", async () => {
    setViewportWidth(390);
    fetchPending.mockResolvedValue([announcement("a1", TWO_SLIDES)]);
    render(<WhatsNewHost enabled />);
    await screen.findByText("S.O.S TPM novo");
    expect(document.querySelector(".rounded-t-\\[10px\\]")).not.toBeNull();
  });
});
