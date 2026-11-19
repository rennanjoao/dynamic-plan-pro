import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({
  mutateAsync: vi.fn(async (..._a: unknown[]) => {}),
  requestAi: vi.fn(async (..._a: unknown[]) => ({ ok: true })),
  ai: null as unknown,
  aiUnavailable: false,
}));
vi.mock("@/hooks/usePostureQuickChecks", () => ({
  useSavePostureQuickCheck: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
  usePostureAiSuggestion: (id: string | null) =>
    id ? { isLoading: false, data: { suggestion: h.ai, unavailable: h.aiUnavailable } } : { isLoading: false, data: undefined },
  useRequestPostureAi: () => ({ mutateAsync: h.requestAi, isPending: false }),
}));
vi.mock("@/lib/studentMedia", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useMediaUrl: (src: string | null) => src,
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), message: vi.fn() }) }));

import PostureQuickEditor from "../PostureQuickEditor";
import { parsePostureAi } from "@/lib/postureQuick";

const source = {
  kind: "checkin" as const, id: "c1", date: "2026-11-18T10:00:00Z",
  photos: { frente: "f.jpg", lateral_dir: "ld.jpg", costas: "c.jpg" },
};

describe("Postura rápida — marcação em poucos toques", () => {
  beforeEach(() => { h.mutateAsync.mockClear(); h.requestAi.mockClear(); h.ai = null; h.aiUnavailable = false; });

  it("tocar no desvio leva a foto para a pose certa", async () => {
    render(<PostureQuickEditor studentId="s1" source={source} existing={null} />);
    expect(screen.getByAltText("Foto Frente")).toBeTruthy();
    await userEvent.click(screen.getByText("Cabeça projetada à frente"));
    expect(screen.getByAltText("Foto Lado D")).toHaveAttribute("src", "ld.jpg");
    await userEvent.click(screen.getByText("Escápulas saltadas (aladas)"));
    expect(screen.getByAltText("Foto Costas")).toBeTruthy();
  });

  it("marca graus, tocar de novo apaga, e salva só o que foi marcado", async () => {
    render(<PostureQuickEditor studentId="s1" source={source} existing={null} />);
    const save = screen.getByTestId("posture-save");
    expect(save).toBeDisabled();
    const ombros = within(screen.getByTestId("posture-row-ombros_desnivelados"));
    await userEvent.click(ombros.getByRole("button", { name: "Observar" }));
    const joelhos = within(screen.getByTestId("posture-row-joelhos_para_dentro"));
    await userEvent.click(joelhos.getByRole("button", { name: "Investigar" }));
    await userEvent.click(joelhos.getByRole("button", { name: "Investigar" })); // apaga
    await userEvent.click(within(screen.getByTestId("posture-row-pes_desabados")).getByRole("button", { name: "Ok" }));
    expect(screen.getByText("2 de 10 avaliados")).toBeTruthy();
    await userEvent.click(save);
    await waitFor(() => expect(h.mutateAsync).toHaveBeenCalled());
    expect(h.mutateAsync.mock.calls[0][0]).toEqual({
      studentId: "s1", sourceKind: "checkin", sourceId: "c1", sourceDate: "2026-11-18T10:00:00Z",
      findings: { ombros_desnivelados: "mild", pes_desabados: "none" }, note: "",
    });
  });

  it("carrega o que já estava marcado neste check-in", () => {
    render(
      <PostureQuickEditor
        studentId="s1"
        source={source}
        existing={{ id: "x", source_kind: "checkin", source_id: "c1", source_date: source.date, findings: { lombar_acentuada: "marked" }, note: "conferir" }}
      />,
    );
    expect(within(screen.getByTestId("posture-row-lombar_acentuada")).getByRole("button", { name: "Investigar" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByDisplayValue("conferir")).toBeTruthy();
  });

  it("marcar Observar/Investigar mostra o raciocínio do manual (teste, favorecer, evitar)", async () => {
    render(<PostureQuickEditor studentId="s1" source={source} existing={null} />);
    expect(screen.queryByTestId("posture-guide-joelhos_para_dentro")).toBeNull();
    await userEvent.click(within(screen.getByTestId("posture-row-joelhos_para_dentro")).getByRole("button", { name: "Observar" }));
    const guide = screen.getByTestId("posture-guide-joelhos_para_dentro");
    expect(guide).toHaveTextContent("Primeiro teste: Agachamento com apoio e amplitude menor.");
    expect(guide).toHaveTextContent("empurrar o joelho para fora à força");
    // "Ok" não mostra guia
    await userEvent.click(within(screen.getByTestId("posture-row-joelhos_para_dentro")).getByRole("button", { name: "Ok" }));
    expect(screen.queryByTestId("posture-guide-joelhos_para_dentro")).toBeNull();
    expect(screen.getByTestId("posture-disclaimer")).toHaveTextContent("Hipótese visual, não diagnóstico.");
    expect(screen.getByTestId("posture-red-flags")).toHaveTextContent("Formigamento");
  });

  it("sugestão da IA: mostra o que viu e só preenche o que o coach não marcou", async () => {
    h.ai = parsePostureAi({
      desvios: {
        joelhos_para_dentro: { grau: "observar", descricao: "joelhos parecem se aproximar levemente" },
        ombros_desnivelados: { grau: "investigar", descricao: "ombro direito parece mais baixo" },
        escapulas_aladas: { grau: "nao_visivel", descricao: "" },
      },
      reliability: 0.5,
      problemas_foto: ["câmera inclinada"],
    });
    render(<PostureQuickEditor studentId="s1" source={source} existing={null} />);
    expect(screen.getByTestId("posture-ai-panel")).toHaveTextContent("confiança 50%");
    expect(screen.getByTestId("posture-ai-panel")).toHaveTextContent("câmera inclinada");
    expect(screen.getByTestId("posture-ai-joelhos_para_dentro")).toHaveTextContent("IA: Observar");
    expect(within(screen.getByTestId("posture-row-escapulas_aladas")).getByText("IA: não deu para ver nesta foto.")).toBeTruthy();
    // coach já marcou ombros como Ok: a IA não sobrescreve
    await userEvent.click(within(screen.getByTestId("posture-row-ombros_desnivelados")).getByRole("button", { name: "Ok" }));
    await userEvent.click(screen.getByTestId("posture-use-ai"));
    expect(within(screen.getByTestId("posture-row-joelhos_para_dentro")).getByRole("button", { name: "Observar" })).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByTestId("posture-row-ombros_desnivelados")).getByRole("button", { name: "Ok" })).toHaveAttribute("aria-pressed", "true");
    // nada é salvo sem o coach tocar em Salvar
    expect(h.mutateAsync).not.toHaveBeenCalled();
  });

  it("sem sugestão ainda: botão pede à IA; sem as 4 fotos, fica desativado", async () => {
    const { unmount } = render(<PostureQuickEditor studentId="s1" source={source} existing={null} />);
    // source tem só 3 fotos
    expect(screen.getByTestId("posture-request-ai")).toBeDisabled();
    unmount();
    const full = { ...source, photos: { ...source.photos, lateral_esq: "le.jpg" } };
    render(<PostureQuickEditor studentId="s1" source={full} existing={null} />);
    await userEvent.click(screen.getByTestId("posture-request-ai"));
    expect(h.requestAi).toHaveBeenCalledWith("c1");
  });

  it("anamnese não tem sugestão da IA (só check-in)", () => {
    render(<PostureQuickEditor studentId="s1" source={{ ...source, kind: "anamnesis" }} existing={null} />);
    expect(screen.queryByTestId("posture-ai-panel")).toBeNull();
  });
});
