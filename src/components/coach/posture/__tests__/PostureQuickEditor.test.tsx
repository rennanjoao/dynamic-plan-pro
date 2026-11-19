import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => ({ mutateAsync: vi.fn(async (..._a: unknown[]) => {}) }));
vi.mock("@/hooks/usePostureQuickChecks", () => ({
  useSavePostureQuickCheck: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));
vi.mock("@/lib/studentMedia", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useMediaUrl: (src: string | null) => src,
}));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

import PostureQuickEditor from "../PostureQuickEditor";

const source = {
  kind: "checkin" as const, id: "c1", date: "2026-11-18T10:00:00Z",
  photos: { frente: "f.jpg", lateral_dir: "ld.jpg", costas: "c.jpg" },
};

describe("Postura rápida — marcação em poucos toques", () => {
  beforeEach(() => h.mutateAsync.mockClear());

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
    await userEvent.click(ombros.getByRole("button", { name: "Leve" }));
    const joelhos = within(screen.getByTestId("posture-row-joelhos_para_dentro"));
    await userEvent.click(joelhos.getByRole("button", { name: "Acentuado" }));
    await userEvent.click(joelhos.getByRole("button", { name: "Acentuado" })); // apaga
    await userEvent.click(within(screen.getByTestId("posture-row-pes_desabados")).getByRole("button", { name: "Não tem" }));
    expect(screen.getByText("2 de 8 avaliados")).toBeTruthy();
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
    expect(within(screen.getByTestId("posture-row-lombar_acentuada")).getByRole("button", { name: "Acentuado" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByDisplayValue("conferir")).toBeTruthy();
  });
});
