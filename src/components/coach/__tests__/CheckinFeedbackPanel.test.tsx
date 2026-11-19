import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";

// ── Dados e mock do cliente Supabase (hoisted: vi.mock é içado para o topo) ──
const h = vi.hoisted(() => {
  type Row = {
    id: string;
    submitted_at: string;
    current_metrics: Record<string, unknown>;
    payload: Record<string, unknown>;
    coach_feedback: string | null;
    photo_url: string | null;
    feedback_read_at: string | null;
  };
  const mk = (id: string, submitted_at: string, peso: number, extra: Partial<Row> = {}): Row => ({
    id,
    submitted_at,
    current_metrics: { peso },
    payload: {},
    coach_feedback: null,
    photo_url: null,
    feedback_read_at: null,
    ...extra,
  });
  const seed = (): Row[] => [
    mk("c3", "2026-10-26T12:00:00Z", 80, { payload: { fotos: { frente: "novo/frente.jpg" } } }),
    // check-in antigo: só tem photo_url (formato legado), sem payload.fotos
    mk("c2", "2026-10-12T12:00:00Z", 82, { photo_url: "legado/frente.jpg", coach_feedback: "ok" }),
    mk("c1", "2026-09-28T12:00:00Z", 85, { coach_feedback: "ok" }),
  ];
  const ALL: Row[] = seed();
  const reset = (rows?: Row[]) => { ALL.splice(0, ALL.length, ...(rows ?? seed())); };
  const updates: Array<{ id: string; values: Record<string, unknown> }> = [];

  type Q = { eqId?: string; lt?: string; limit?: number };
  const resolve = (table: string, q: Q) => {
    if (table !== "check_ins") return { data: null };
    if (q.eqId) return { data: ALL.find((r) => r.id === q.eqId) ?? null };
    if (q.lt) {
      const older = ALL.filter((r) => r.submitted_at < q.lt!).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at))[0];
      return { data: older ?? null };
    }
    if (q.limit === 60) return { data: ALL.map((r) => ({ id: r.id, submitted_at: r.submitted_at, coach_feedback: r.coach_feedback })) };
    return { data: [ALL[0]] };
  };
  const chain = (table: string) => {
    const q: Q = {};
    let pendingUpdate: Record<string, unknown> | null = null;
    const c: Record<string, unknown> = {
      select: () => c,
      update: (values: Record<string, unknown>) => { pendingUpdate = values; return c; },
      eq: (col: string, v: string) => {
        if (pendingUpdate) {
          updates.push({ id: v, values: pendingUpdate });
          const row = ALL.find((r) => r.id === v);
          if (row) Object.assign(row, pendingUpdate);
          pendingUpdate = null;
          return Promise.resolve({ error: null });
        }
        if (col === "id" || col === "check_in_id") q.eqId = v;
        return c;
      },
      lt: (_col: string, v: string) => { q.lt = v; return c; },
      order: () => c,
      limit: (n: number) => { q.limit = n; return c; },
      maybeSingle: () => Promise.resolve(resolve(table, q)),
      then: (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => Promise.resolve(resolve(table, q)).then(ok, ko),
    };
    return c;
  };
  return { chain, reset, mk, updates, invoke: vi.fn(() => Promise.resolve({ error: null })) };
});

vi.mock("@/integrations/supabase/untyped", () => ({ sb: { from: (t: string) => h.chain(t) } }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: h.invoke } },
}));
vi.mock("@/lib/studentMedia", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useMediaUrl: (src: string | null) => src,
}));
vi.mock("@/components/student/ProgressChart", () => ({ ProgressChart: () => <div>GRAFICO_EVOLUCAO</div> }));
vi.mock("@/components/anamnesis/AnamnesisViewer", () => ({ default: () => <div>ANAMNESE</div> }));
vi.mock("@/components/coach/CheckinPayloadAnswers", () => ({ default: () => <div>RESPOSTAS</div> }));
vi.mock("@/components/coach/CheckinFullEditor", () => ({ default: () => null }));
vi.mock("@/components/coach/dashboard/CheckinHistoryDialog", () => ({
  CheckinHistoryDialog: () => <div>DIALOGO_HISTORICO</div>,
}));

import CheckinFeedbackPanel from "../CheckinFeedbackPanel";

const wrap = (ui: React.ReactElement) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const renderPanel = () =>
  wrap(<CheckinFeedbackPanel open onClose={() => {}} studentId="s1" studentName="Aluno Teste" />);

describe("CheckinFeedbackPanel", () => {
  beforeEach(() => { vi.clearAllMocks(); h.reset(); h.updates.length = 0; });

  it("abre o check-in MAIS ANTIGO ainda sem resposta (não o mais recente)", async () => {
    h.reset([
      h.mk("c3", "2026-10-26T12:00:00Z", 80),
      h.mk("c2", "2026-10-12T12:00:00Z", 82),
      h.mk("c1", "2026-09-28T12:00:00Z", 85, { coach_feedback: "respondido" }),
    ]);
    renderPanel();
    // c2 (82 kg) comparado com c1 (85 kg)
    expect(await screen.findByText("(-3.0)")).toBeInTheDocument();
    expect(screen.getByTestId("pending-reply-banner")).toHaveTextContent("2 check-ins sem resposta deste aluno");
  });

  it("'Enviar e abrir o próximo': salva, avisa o aluno e abre o próximo check-in pendente do mesmo aluno", async () => {
    h.reset([
      h.mk("c3", "2026-10-26T12:00:00Z", 80),
      h.mk("c2", "2026-10-12T12:00:00Z", 82),
      h.mk("c1", "2026-09-28T12:00:00Z", 85, { coach_feedback: "respondido" }),
    ]);
    renderPanel();
    expect(await screen.findByText("(-3.0)")).toBeInTheDocument();
    await userEvent.type(screen.getByTestId("feedback-textarea"), "Boa evolução");
    await userEvent.click(screen.getByTestId("send-and-next"));
    await waitFor(() => expect(h.updates).toEqual([{ id: "c2", values: { coach_feedback: "Boa evolução" } }]));
    expect(h.invoke).toHaveBeenCalledWith("reply-to-student", expect.anything());
    // agora o c3 (80 kg) vs c2 (82 kg)
    expect(await screen.findByText("(-2.0)")).toBeInTheDocument();
    expect(screen.getByTestId("feedback-textarea")).toHaveValue("");
  });

  it("sem mais pendentes deste aluno, 'Enviar e abrir o próximo' passa para o próximo aluno da fila", async () => {
    const onOpenNext = vi.fn();
    const next = { id: "s2", name: "Próxima Aluna" } as never;
    wrap(<CheckinFeedbackPanel open onClose={() => {}} studentId="s1" studentName="Aluno Teste" nextStudent={next} onOpenNext={onOpenNext} />);
    expect(await screen.findByText("(-2.0)")).toBeInTheDocument();
    expect(screen.getByText("Próxima Aluna")).toBeInTheDocument();
    await userEvent.type(screen.getByTestId("feedback-textarea"), "Seguimos");
    await userEvent.click(screen.getByTestId("send-and-next"));
    await waitFor(() => expect(onOpenNext).toHaveBeenCalledWith(next));
  });

  it("no celular há um botão fixo que leva direto ao campo de feedback", async () => {
    renderPanel();
    const jump = await screen.findByTestId("jump-to-feedback");
    expect(jump).toHaveTextContent("Escrever feedback");
    const ta = screen.getByTestId("feedback-textarea") as HTMLTextAreaElement;
    ta.scrollIntoView = vi.fn();
    await userEvent.click(jump);
    expect(ta.scrollIntoView).toHaveBeenCalled();
  });

  it("abre o check-in pedido (vindo do histórico da ficha)", async () => {
    wrap(<CheckinFeedbackPanel open onClose={() => {}} studentId="s1" studentName="Aluno Teste" initialCheckinId="c2" />);
    expect(await screen.findByText("(-3.0)")).toBeInTheDocument();
  });

  it("compara o check-in aberto com o ANTERIOR a ele, também ao trocar pelo seletor", async () => {
    renderPanel();

    // Mais recente (80 kg) vs anterior (82 kg)
    expect(await screen.findByText("(-2.0)")).toBeInTheDocument();
    expect(screen.getByText(/Variação vs check-in de 12\/10\/2026/)).toBeInTheDocument();

    // Troca para o check-in do meio (82 kg): deve comparar com o de 85 kg, não com ele mesmo.
    await userEvent.selectOptions(await screen.findByRole("combobox"), "c2");
    expect(await screen.findByText("(-3.0)")).toBeInTheDocument();
    expect(screen.queryByText("(0.0)")).not.toBeInTheDocument();
  });

  it("mostra a foto do check-in anterior mesmo no formato antigo (photo_url) ao lado da atual", async () => {
    renderPanel();
    const anterior = await screen.findByAltText("Frente — anterior");
    expect(anterior).toHaveAttribute("src", "legado/frente.jpg");
    expect(screen.getByAltText("Frente — atual")).toHaveAttribute("src", "novo/frente.jpg");
  });

  it("exibe o gráfico de evolução no próprio painel, sem abrir outra tela", async () => {
    renderPanel();
    expect(await screen.findByText("GRAFICO_EVOLUCAO")).toBeInTheDocument();
  });

  it("não duplica o histórico: 'Histórico' abre só o diálogo completo (sem lista inline)", async () => {
    renderPanel();
    await userEvent.click(await screen.findByRole("button", { name: /Histórico/ }));
    expect(await screen.findByText("DIALOGO_HISTORICO")).toBeInTheDocument();
    expect(screen.queryByText(/Histórico de feedbacks/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Baixar selecionados/)).not.toBeInTheDocument();
  });
});
