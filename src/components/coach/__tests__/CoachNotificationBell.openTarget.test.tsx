import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const h = vi.hoisted(() => {
  const rows = [
    { id: "n1", coach_id: "c1", student_id: "s1", student_name: "Maria", context: "Check-in", message: "Check-in enviado", is_read: false, created_at: "2026-11-18T10:00:00Z" },
    { id: "n2", coach_id: "c1", student_id: "s2", student_name: "Ana", context: "Treino", message: "Posso trocar o leg press?", is_read: false, created_at: "2026-11-18T11:00:00Z" },
  ];
  const updates: string[] = [];
  const chain = () => {
    let updating = false;
    const c: Record<string, unknown> = {
      select: () => c,
      update: () => { updating = true; return c; },
      delete: () => c,
      eq: (_col: string, v: string) => { if (updating) { updates.push(v); return Promise.resolve({ error: null }); } return c; },
      order: () => Promise.resolve({ data: rows, error: null }),
    };
    return c;
  };
  return { chain, updates };
});

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "c1" } } } }) },
    from: () => h.chain(),
    channel: () => ({ on: function () { return this; }, subscribe: function () { return this; } }),
    removeChannel: vi.fn(),
    functions: { invoke: vi.fn() },
  },
}));

import CoachNotificationBell from "../CoachNotificationBell";

describe("sininho do coach", () => {
  it("aviso de check-in abre o check-in (painel completo) e marca como lido; dúvida segue com Responder", async () => {
    const onOpenStudent = vi.fn();
    render(<CoachNotificationBell onOpenStudent={onOpenStudent} />);
    await userEvent.click(screen.getByRole("button"));
    await screen.findByText("Check-in enviado");
    // Check-in: sem "Responder" solto (a resposta não ficava gravada no check-in)
    const open = screen.getByTestId("notification-open-target");
    expect(open).toHaveTextContent("Abrir check-in");
    expect(screen.getAllByRole("button", { name: /Responder/ })).toHaveLength(1); // só o da dúvida
    await userEvent.click(open);
    expect(onOpenStudent).toHaveBeenCalledWith("s1", "checkin");
    await waitFor(() => expect(h.updates).toContain("n1"));
  });
});
