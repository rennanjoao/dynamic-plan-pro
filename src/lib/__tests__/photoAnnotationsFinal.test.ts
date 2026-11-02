import { describe, it, expect } from "vitest";
import {
  createLine, createRefLine, moveHandle, toFreeLine, toNormalized, lineToPixels, historyInit, historyPush, historyUndo, historyRedo,
  isDirty, duplicateLinesForTarget, resolveCheckinPhotos, exportFileName, sanitizeLines,
} from "@/lib/photoAnnotations";
import { copyImageBlob } from "@/lib/annotationExport";

describe("geometria das ferramentas", () => {
  it("horizontal continua horizontal ao mover qualquer ponto", () => {
    const h = createLine("horizontal", undefined, "h");
    const a = moveHandle(h, "a", { x: 0.1, y: 0.3 });
    expect(a.a.y).toBe(a.b.y);
    const b = moveHandle(a, "b", { x: 0.9, y: 0.7 });
    expect(b.a.y).toBe(0.7); expect(b.b.y).toBe(0.7);
  });
  it("vertical continua vertical", () => {
    const v = moveHandle(createLine("vertical", undefined, "v"), "b", { x: 0.4, y: 0.2 });
    expect(v.a.x).toBe(v.b.x);
  });
  it("linha livre pode inclinar; conversão explícita libera a horizontal", () => {
    const f = moveHandle(createLine("free", undefined, "f"), "a", { x: 0.1, y: 0.9 });
    expect(f.a).toEqual({ x: 0.1, y: 0.9 });
    const conv = moveHandle(toFreeLine(createRefLine("shoulders", undefined, "s")), "a", { x: 0.2, y: 0.1 });
    expect(conv.a.y).not.toBe(conv.b.y);
    expect(conv.ref).toBe("free");
  });
});

describe("alinhamento com zoom/pan/resize", () => {
  it("o mesmo ponto da imagem dá a mesma coordenada em qualquer escala/deslocamento", () => {
    const p = { x: 0.37, y: 0.62 };
    for (const [s, tx, ty] of [[1, 0, 0], [2.5, -140, 80], [8, 300, -900]]) {
      const rect = { left: 50 + tx, top: 20 + ty, width: 300 * s, height: 400 * s };
      const n = toNormalized(rect.left + p.x * rect.width, rect.top + p.y * rect.height, rect);
      expect(n.x).toBeCloseTo(p.x); expect(n.y).toBeCloseTo(p.y);
    }
  });
  it("converte para pixels da imagem natural", () => {
    expect(lineToPixels({ id: "1", tool: "free", a: { x: 0.5, y: 0.25 }, b: { x: 1, y: 1 } }, 1000, 2000)).toEqual({ x1: 500, y1: 500, x2: 1000, y2: 2000 });
  });
});

describe("desfazer/refazer e alterações não salvas", () => {
  it("undo e redo", () => {
    const l = createLine("free", undefined, "x");
    let h = historyPush(historyInit([]), [l]);
    h = historyUndo(h); expect(h.present).toEqual([]);
    h = historyRedo(h); expect(h.present).toEqual([l]);
  });
  it("detecta mudança de linha, grau ou nota", () => {
    const base = { lines: [], degree: "subtle" as const, note: "a" };
    expect(isDirty(base, { ...base })).toBe(false);
    expect(isDirty(base, { ...base, note: "b" })).toBe(true);
    expect(isDirty(base, { ...base, degree: "marked" })).toBe(true);
    expect(isDirty(base, { ...base, lines: [createLine("free", undefined, "z")] })).toBe(true);
  });
});

describe("duplicação", () => {
  const src = [createRefLine("pelvis", undefined, "orig")];
  it("cria cópia independente sem mexer na origem", () => {
    const r = duplicateLinesForTarget(src, "frente", "frente", () => "novo");
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.lines[0].id).toBe("novo"); r.lines[0].a.x = 0; }
    expect(src[0].id).toBe("orig"); expect(src[0].a.x).not.toBe(0);
  });
  it("bloqueia poses diferentes", () => {
    expect(duplicateLinesForTarget(src, "frente", "costas").ok).toBe(false);
  });
});

describe("fotos de check-in", () => {
  it("usa photo_url como frontal quando payload não tem frente", () => {
    expect(resolveCheckinPhotos({ fotos: { costas: "c.jpg" } }, "old.jpg")).toEqual({ costas: "c.jpg", frente: "old.jpg" });
  });
  it("mantém a frontal explícita do payload", () => {
    expect(resolveCheckinPhotos({ fotos: { frente: "f.jpg" } }, "old.jpg")).toEqual({ frente: "f.jpg" });
  });
  it("sem nada → vazio", () => { expect(resolveCheckinPhotos(null, null)).toEqual({}); });
});

describe("exportação", () => {
  it("nome de arquivo neutro com data e pose", () => {
    expect(exportFileName("checkin", "2026-09-05T10:00:00Z", "frente")).toBe("marcacao-checkin-2026-09-05-frente.png");
  });
  it("clipboard indisponível retorna false (UI cai para download)", async () => {
    expect(await copyImageBlob(new Blob(["x"], { type: "image/png" }), {} as Navigator)).toBe(false);
  });
  it("preserva ref e 'não avaliável' ao ler do banco, e descarta ref incoerente", () => {
    const out = sanitizeLines([
      { id: "a", tool: "horizontal", ref: "knees", notAssessable: true, a: { x: 0, y: 0.5 }, b: { x: 1, y: 0.5 } },
      { id: "b", tool: "free", ref: "axis", a: { x: 0, y: 0 }, b: { x: 1, y: 1 } },
    ]);
    expect(out[0].ref).toBe("knees"); expect(out[0].notAssessable).toBe(true);
    expect(out[1].ref).toBeUndefined();
  });
});
