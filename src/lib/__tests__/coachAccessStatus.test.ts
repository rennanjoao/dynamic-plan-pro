import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const maybeSingle = vi.fn();
const chain: Record<string, unknown> = {};
for (const m of ["select", "eq", "order", "limit"]) chain[m] = vi.fn(() => chain);
chain.maybeSingle = maybeSingle;
const from = vi.fn(() => chain);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpc(...a), from: (...a: unknown[]) => from(...a) },
}));

import {
  blockedFromCache,
  fetchCoachBlocked,
  isBlockedUntilActive,
  isMissingFunctionError,
  readCachedCoachBlocked,
} from "@/lib/coachAccessStatus";

const UID = "aluno-1";

beforeEach(() => {
  rpc.mockReset();
  maybeSingle.mockReset();
  from.mockClear();
  localStorage.clear();
});

describe("coachAccessStatus helpers", () => {
  it("reconhece função inexistente", () => {
    expect(isMissingFunctionError({ code: "PGRST202" })).toBe(true);
    expect(isMissingFunctionError({ code: "42883" })).toBe(true);
    expect(isMissingFunctionError({ code: "500", message: "timeout" })).toBe(false);
    expect(isMissingFunctionError(null)).toBe(false);
  });

  it("blocked_until só bloqueia no futuro", () => {
    const now = new Date("2026-11-17T12:00:00Z");
    expect(isBlockedUntilActive("2026-11-18T00:00:00Z", now)).toBe(true);
    expect(isBlockedUntilActive("2026-11-16T00:00:00Z", now)).toBe(false);
    expect(isBlockedUntilActive(null, now)).toBe(false);
  });

  it("sem cache não bloqueia; cache bloqueado mantém bloqueio", () => {
    expect(blockedFromCache(null)).toBe(false);
    expect(blockedFromCache(false)).toBe(false);
    expect(blockedFromCache(true)).toBe(true);
  });
});

describe("fetchCoachBlocked", () => {
  it("usa a RPC oficial e grava o status no aparelho", async () => {
    rpc.mockResolvedValue({ data: [{ coach_id: "c1", coach_blocked: true }], error: null });
    expect(await fetchCoachBlocked(UID)).toBe(true);
    expect(rpc).toHaveBeenCalledWith("get_my_coach_access_status");
    expect(readCachedCoachBlocked(UID)).toBe(true);
  });

  it("sem vínculo ativo → liberado", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    expect(await fetchCoachBlocked(UID)).toBe(false);
    expect(readCachedCoachBlocked(UID)).toBe(false);
  });

  it("RPC ainda não aplicada → consulta direta por coach_students", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST202" } });
    maybeSingle
      .mockResolvedValueOnce({ data: { coach_id: "c1" }, error: null })
      .mockResolvedValueOnce({ data: { blocked_until: "2999-01-01T00:00:00Z" }, error: null });
    expect(await fetchCoachBlocked(UID)).toBe(true);
    expect(from).toHaveBeenCalledWith("coach_students");
    expect(from).not.toHaveBeenCalledWith("coach_plans");
  });

  it("erro de rede usa o último status conhecido (bloqueado continua bloqueado)", async () => {
    localStorage.setItem(`coach_access_status_${UID}`, "1");
    rpc.mockResolvedValue({ data: null, error: { code: "500", message: "network" } });
    expect(await fetchCoachBlocked(UID)).toBe(true);
  });

  it("erro de rede sem histórico não trava a aluna", async () => {
    rpc.mockRejectedValue(new Error("Failed to fetch"));
    expect(await fetchCoachBlocked(UID)).toBe(false);
  });
});
