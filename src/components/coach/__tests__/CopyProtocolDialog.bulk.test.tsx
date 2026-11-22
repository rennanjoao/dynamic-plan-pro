import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useCoachStudents", () => ({
  useCoachStudentsLite: () => ({
    data: [
      { id: "s1", name: "Ana" }, { id: "s2", name: "Bruna" }, { id: "s3", name: "Carla" },
    ],
    isLoading: false,
  }),
}));
const plan = vi.fn();
const copy = vi.fn();
vi.mock("@/lib/protocolBulkCopy", () => ({
  planBulkCopy: (...a: unknown[]) => plan(...a),
  copyToTarget: (...a: unknown[]) => copy(...a),
}));

import CopyProtocolDialog from "../CopyProtocolDialog";
import { buildBasePayload } from "@/lib/protocolSchema";

describe("Aplicar a vários alunos", () => {
  beforeEach(() => {
    plan.mockReset(); copy.mockReset();
    plan.mockImplementation(async (targets: Array<{ id: string; name: string }>) =>
      targets.map((t) => ({ ...t, protocol: t.id === "s2" ? { id: "p2", payload: {}, revision: 1, name: "", active: true } : null, draftPayload: t.id === "s2" ? {} : null })));
    copy.mockImplementation(async (p: { id: string; name: string; protocol: unknown }) => ({ id: p.id, name: p.name, ok: true, mode: p.protocol ? "draft" : "created" }));
  });

  it("escolhe vários, avisa quem tem rascunho, copia um a um e abre a fila", async () => {
    const onOpenQueue = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <CopyProtocolDialog
        open onOpenChange={onOpenChange} coachId="c1"
        payload={buildBasePayload({ split: "AB", mealsCount: 3, carbCycle: false })}
        sourceStudentId="s1" protocolName="Modelo" sourceLabel="Modelo: Hipertrofia feminina"
        onOpenQueue={onOpenQueue}
      />,
    );
    // o aluno de origem não aparece
    expect(screen.queryByLabelText("Ana")).toBeNull();
    await userEvent.click(screen.getByLabelText("Bruna"));
    await userEvent.click(screen.getByLabelText("Carla"));
    await userEvent.click(screen.getByTestId("bulk-review"));

    const confirmBox = await screen.findByTestId("bulk-confirm");
    expect(within(confirmBox).getByText(/rascunho não publicado/).nextSibling?.textContent).toBe("Bruna");
    expect(within(confirmBox).getByText(/será criado um protocolo inativo/).nextSibling?.textContent).toBe("Carla");

    await userEvent.click(screen.getByTestId("bulk-run"));
    expect(copy).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/rascunho atualizado/)).toBeInTheDocument();
    expect(screen.getByText(/protocolo inativo criado/)).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("bulk-open-queue"));
    expect(onOpenQueue).toHaveBeenCalledWith(["s2", "s3"]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
