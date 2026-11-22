import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/untyped", () => ({ sb: {} }));

import { copyToTarget, planBulkCopy } from "../protocolBulkCopy";
import { buildBasePayload } from "../protocolSchema";

/** Cliente falso: registra chamadas e devolve as linhas da tabela pedida. */
function fakeClient(tables: Record<string, unknown[]>) {
  const calls: Array<{ table?: string; fn?: string; op: string; args?: unknown }> = [];
  const client = {
    calls,
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "in", "eq", "order"]) q[m] = (...a: unknown[]) => { calls.push({ table, op: m, args: a }); return q; };
      q.insert = (row: unknown) => { calls.push({ table, op: "insert", args: row }); return Promise.resolve({ error: null }); };
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve);
      return q;
    },
    rpc(fn: string, args: Record<string, unknown>) { calls.push({ fn, op: "rpc", args }); return Promise.resolve({ data: null, error: null }); },
  };
  return client;
}

const model = (() => {
  const p = buildBasePayload({ split: "AB", mealsCount: 3, carbCycle: false }) as Record<string, unknown>;
  p.workouts = [{ key: "A", focus: "Modelo", exercises: [] }];
  p.macros = { calories: 1800, protein: 140, carbs: 180, fat: 50, fiber: 25, water: 3, goal: "emagrecimento" };
  p.guidelines = { training: "Do modelo", diet: "", weekOrganization: "", supplementation: "" };
  return p;
})();

describe("copiar um modelo para vários alunos (rascunho individual)", () => {
  it("planeja com o protocolo mais recente e o rascunho de cada aluno", async () => {
    const client = fakeClient({
      protocols: [
        { id: "p-new", student_id: "s2", payload: { v: 2 }, revision: 5, name: "Novo", active: true },
        { id: "p-old", student_id: "s2", payload: { v: 1 }, revision: 2, name: "Velho", active: true },
      ],
      protocol_drafts: [{ protocol_id: "p-new", payload: { draft: true } }],
    });
    const plans = await planBulkCopy([{ id: "s2", name: "Bruna" }, { id: "s3", name: "Carla" }], client as never);
    expect(plans[0]).toMatchObject({ id: "s2", protocol: { id: "p-new", revision: 5 }, draftPayload: { draft: true } });
    expect(plans[1]).toMatchObject({ id: "s3", protocol: null, draftPayload: null });
  });

  it("aluno com protocolo: seções marcadas entram no RASCUNHO; macros dele ficam", async () => {
    const own = buildBasePayload({ split: "ABC", mealsCount: 5, carbCycle: false }) as Record<string, unknown>;
    own.macros = { calories: 2500, protein: 180, carbs: 300, fat: 70, fiber: 30, water: 4, goal: "hipertrofia" };
    own.guidelines = { training: "Do aluno", diet: "", weekOrganization: "", supplementation: "" };
    const client = fakeClient({});
    const r = await copyToTarget(
      { id: "s2", name: "Bruna", protocol: { id: "p2", payload: own, revision: 7, name: "Protocolo da Bruna", active: true }, draftPayload: null },
      { coachId: "c1", src: model, sections: { workout: true, diet: true }, copyMacros: false },
      client as never,
    );
    expect(r).toMatchObject({ ok: true, mode: "draft" });
    const rpc = client.calls.find((c) => c.op === "rpc")!;
    type Args = { p_as_draft: boolean; p_protocol_id: string; p_expected_revision: number; p_payload: { workouts: Array<{ focus: string }>; macros: { calories: number }; guidelines: { training: string } } };
    const args = rpc.args as Args;
    expect(rpc.fn).toBe("save_protocol_with_plan");
    expect(args.p_as_draft).toBe(true);
    expect(args.p_protocol_id).toBe("p2");
    expect(args.p_expected_revision).toBe(7);
    expect(args.p_payload.workouts[0].focus).toBe("Modelo");
    expect(args.p_payload.macros.calories).toBe(2500);
    expect(args.p_payload.guidelines.training).toBe("Do aluno"); // diretrizes não marcadas
  });

  it("aluno sem protocolo: cria protocolo INATIVO (o aluno não vê nada)", async () => {
    const client = fakeClient({});
    const r = await copyToTarget(
      { id: "s3", name: "Carla", protocol: null, draftPayload: null },
      { coachId: "c1", src: model, sections: { workout: true, diet: true, supplements: true, guidelines: true }, copyMacros: true },
      client as never,
    );
    expect(r).toMatchObject({ ok: true, mode: "created" });
    const ins = client.calls.find((c) => c.op === "insert")!;
    const row = ins.args as { payload: { macros: { calories: number } } } & Record<string, unknown>;
    expect(ins.table).toBe("protocols");
    expect(row).toMatchObject({ coach_id: "c1", student_id: "s3", active: false, is_template: false, name: "Protocolo — Carla" });
    expect(row.payload.macros.calories).toBe(1800);
  });

  it("erro de um aluno não derruba os outros (vira resultado com erro)", async () => {
    const client = fakeClient({});
    client.rpc = () => Promise.resolve({ data: null, error: { message: "student is not assigned to this coach" } });
    const r = await copyToTarget(
      { id: "s9", name: "X", protocol: { id: "p9", payload: {}, revision: 1, name: "", active: true }, draftPayload: null },
      { coachId: "c1", src: model, sections: { workout: true }, copyMacros: false },
      client as never,
    );
    expect(r).toMatchObject({ ok: false, error: "student is not assigned to this coach" });
  });
});
