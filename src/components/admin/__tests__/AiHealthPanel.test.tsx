import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { AiHealthPanel } from "../AiHealthPanel";

describe("AiHealthPanel", () => {
  beforeEach(() => invoke.mockReset());

  it("mostra o estado de cada chave em português", async () => {
    invoke.mockResolvedValue({
      data: {
        checkedAt: "2026-11-19T12:00:00Z",
        groqModel: null,
        groqVisionModel: null,
        results: [
          { key: "GROQ_API_KEY_EVAL", uso: "Avaliações do coach", state: "ok", message: "Funcionando.", model: "qwen/qwen3.8-27b", visionReady: true },
          { key: "GROQ_API_KEY_STUDENTS", uso: "Chat das alunas", state: "chave_invalida", message: "Chave recusada pelo Groq." },
        ],
      },
      error: null,
    });
    render(<AiHealthPanel />);
    fireEvent.click(screen.getByTestId("ai-health-run"));
    await waitFor(() => expect(screen.getByTestId("ai-health-GROQ_API_KEY_EVAL")).toBeInTheDocument());
    expect(invoke).toHaveBeenCalledWith("ai-health", { body: {} });
    expect(screen.getByText("Funcionando")).toBeInTheDocument();
    expect(screen.getByText("Chave recusada")).toBeInTheDocument();
    expect(screen.getByText("Chave recusada pelo Groq.")).toBeInTheDocument();
  });

  it("mostra a mensagem real quando a function falha", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("Edge Function returned a non-2xx status code"), {
        context: new Response(JSON.stringify({ error: "Apenas administradores." }), { status: 403 }),
      }),
    });
    render(<AiHealthPanel />);
    fireEvent.click(screen.getByTestId("ai-health-run"));
    await waitFor(() => expect(screen.getByTestId("ai-health-error")).toHaveTextContent("Apenas administradores."));
  });
});
