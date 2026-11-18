import { beforeEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.fn();
const upsert = vi.fn();
const chain: Record<string, unknown> = {};
for (const m of ["select", "eq", "delete"]) chain[m] = vi.fn(() => chain);
chain.maybeSingle = maybeSingle;
chain.upsert = upsert;
const from = vi.fn((_t: string) => chain);

vi.mock("@/integrations/supabase/untyped", () => ({ sb: { from: (t: string) => from(t) } }));

import {
  __resetRemoteAvailability,
  fetchRemoteNewDraft,
  pickNewestDraft,
  saveRemoteNewDraft,
  withTimeout,
} from "@/lib/protocolNewDraft";

beforeEach(() => {
  maybeSingle.mockReset();
  upsert.mockReset();
  from.mockClear();
  __resetRemoteAvailability();
});

describe("pickNewestDraft", () => {
  const p = { setup: {} };
  it("sem nenhum → null; só um → ele", () => {
    expect(pickNewestDraft(null, null)).toBeNull();
    expect(pickNewestDraft({ payload: p, savedAt: 1 }, null)?.savedAt).toBe(1);
    expect(pickNewestDraft(null, { payload: p, savedAt: 2 })?.savedAt).toBe(2);
  });
  it("fica com o mais recente", () => {
    expect(pickNewestDraft({ payload: p, savedAt: 10 }, { payload: p, savedAt: 20 })?.savedAt).toBe(20);
    expect(pickNewestDraft({ payload: p, savedAt: 30 }, { payload: p, savedAt: 20 })?.savedAt).toBe(30);
  });
  it("sem data no remoto, prefere o local", () => {
    expect(pickNewestDraft({ payload: p, savedAt: 5 }, { payload: { x: 1 } })?.savedAt).toBe(5);
  });
  it("ignora rascunho sem payload", () => {
    expect(pickNewestDraft({ payload: null, savedAt: 99 }, { payload: p, savedAt: 1 })?.savedAt).toBe(1);
  });
});

describe("withTimeout", () => {
  it("devolve o fallback quando demora", async () => {
    vi.useFakeTimers();
    const slow = new Promise<string>(() => { /* nunca resolve */ });
    const r = withTimeout(slow, 4000, "fallback");
    vi.advanceTimersByTime(4000);
    await expect(r).resolves.toBe("fallback");
    vi.useRealTimers();
  });
  it("devolve o fallback quando falha", async () => {
    await expect(withTimeout(Promise.reject(new Error("x")), 1000, null)).resolves.toBeNull();
  });
});

describe("remoto", () => {
  it("lê o rascunho do banco com data", async () => {
    maybeSingle.mockResolvedValue({ data: { name: "P", payload: { a: 1 }, updated_at: "2026-11-17T10:00:00Z" }, error: null });
    const d = await fetchRemoteNewDraft("c1", "s1");
    expect(d?.name).toBe("P");
    expect(d?.savedAt).toBe(Date.parse("2026-11-17T10:00:00Z"));
    expect(from).toHaveBeenCalledWith("protocol_new_drafts");
  });

  it("tabela ainda não criada → para de tentar nesta sessão", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { code: "PGRST205", message: "Could not find the table" } });
    expect(await fetchRemoteNewDraft("c1", "s1")).toBeNull();
    from.mockClear();
    expect(await saveRemoteNewDraft("c1", "s1", { payload: {} })).toBe(false);
    expect(from).not.toHaveBeenCalled();
  });

  it("grava com upsert por coach+aluno", async () => {
    upsert.mockResolvedValue({ error: null });
    expect(await saveRemoteNewDraft("c1", "s1", { name: "P", payload: { a: 1 } })).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      { coach_id: "c1", student_id: "s1", name: "P", payload: { a: 1 } },
      { onConflict: "coach_id,student_id" },
    );
  });
});
