/**
 * ProtocolBuilderSheet.test.ts
 * Regressão estrutural: garante que o Sheet de Anamnese:
 *  1. usa <Sheet> (Radix Portal — não desmonta o builder)
 *  2. carrega AnamnesisViewer via lazy()/Suspense (não bloqueia o tree)
 *  3. monta o AnamnesisViewer apenas quando consultOpen === true
 *     (não dispara consulta enquanto fechado)
 *
 * Render de integração é frágil para esse componente (size 925 LOC, muitas deps Supabase
 * e contexto auth). A asserção é feita sobre o source para travar regressões arquiteturais.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/components/coach/ProtocolBuilder.tsx"),
  "utf8"
);

describe("ProtocolBuilder — Sheet de Anamnese (regressão)", () => {
  it("usa lazy() para AnamnesisViewer", () => {
    expect(SRC).toMatch(/lazy\(\s*\(\)\s*=>\s*import\("@\/components\/anamnesis\/AnamnesisViewer"\)\s*\)/);
  });

  it("usa <Sheet> (portal) — nunca <Dialog> embutido no tree principal para Anamnese", () => {
    expect(SRC).toMatch(/<Sheet\s+open=\{consultOpen\}/);
    expect(SRC).toMatch(/<SheetContent/);
  });

  it("renderiza AnamnesisViewer dentro de <Suspense>", () => {
    expect(SRC).toMatch(/<Suspense[\s\S]*?<AnamnesisViewerLazy/);
  });

  it("monta o viewer apenas com consultOpen === true (evita fetch quando fechado)", () => {
    // padrão: {consultOpen && (<Suspense>...<AnamnesisViewerLazy/>)}
    expect(SRC).toMatch(/\{consultOpen\s*&&[\s\S]*?<AnamnesisViewerLazy/);
  });

  it("state consultOpen é local (useState boolean) — não derruba o estado da dieta", () => {
    expect(SRC).toMatch(/useState[<(][^)]*\)\s*[^;]*consultOpen|const\s*\[\s*consultOpen\s*,\s*setConsultOpen\s*\]\s*=\s*useState/);
  });

  it("não há early-return baseado em consultOpen no corpo do componente", () => {
    // se houvesse `if (consultOpen) return ...` o builder desmontaria
    expect(SRC).not.toMatch(/if\s*\(\s*consultOpen\s*\)\s*return/);
  });
});