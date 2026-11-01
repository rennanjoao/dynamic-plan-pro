import { describe, it, expect } from "vitest";
import { toNormalized, createLine, moveHandle, lineAngleDeg, sanitizeLines, extractReportedAttention } from "@/lib/photoAnnotations";

describe("photoAnnotations", () => {
  it("normaliza para o retângulo da imagem e limita a 0–1", () => {
    const r = { left: 100, top: 50, width: 200, height: 400 };
    expect(toNormalized(200, 250, r)).toEqual({ x: 0.5, y: 0.5 });
    expect(toNormalized(0, 1000, r)).toEqual({ x: 0, y: 1 });
  });
  it("coordenadas independem do tamanho da tela", () => {
    const p = { x: 0.3, y: 0.6 };
    for (const w of [300, 1200]) {
      const r = { left: 0, top: 0, width: w, height: w * 4 / 3 };
      expect(toNormalized(p.x * r.width, p.y * r.height, r)).toEqual(p);
    }
  });
  it("eixo vertical continua vertical ao mover", () => {
    const l = moveHandle(createLine("vertical", undefined, "v"), "a", { x: 0.2, y: 0.1 });
    expect(l.a.x).toBe(0.2); expect(l.b.x).toBe(0.2);
  });
  it("calcula ângulo considerando a proporção", () => {
    const l = { id: "1", tool: "free" as const, a: { x: 0, y: 1 }, b: { x: 1, y: 0 } };
    expect(lineAngleDeg(l, 1)).toBe(45);
    expect(lineAngleDeg({ ...l, b: { x: 1, y: 1 } }, 0.75)).toBe(0);
  });
  it("descarta linhas inválidas", () => {
    expect(sanitizeLines([{ tool: "x" }, { id: "a", tool: "free", a: { x: 2, y: 0 }, b: { x: 0, y: 0 } }])).toEqual([
      { id: "a", tool: "free", a: { x: 1, y: 0 }, b: { x: 0, y: 0 } },
    ]);
  });
  it("só mostra relatos explícitos", () => {
    const r = extractReportedAttention(
      { submitted_at: "2026-01-01", payload: { lesoes: "Não", cirurgias: "Ombro 2020", dificuldade_treino: "falta de tempo" } },
      [{ submitted_at: "2026-02-01", payload: { evento_relevante: "Sim", evento_relevante_desc: "dor no joelho" } }, { submitted_at: "2026-03-01", payload: { evento_relevante: "Não" } }],
    );
    expect(r.map((x) => x.answer)).toEqual(["Ombro 2020", "dor no joelho"]);
  });
});
