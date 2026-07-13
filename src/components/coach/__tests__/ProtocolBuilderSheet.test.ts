/**
 * ProtocolBuilderSheet.test.ts
 * Regressão estrutural: garante que o painel de consulta lateral:
 *  1. carrega CheckinFeedbackPanel via lazy()/Suspense (não bloqueia o tree
 *     principal do builder e é renderizado em portal via Dialog)
 *  2. monta o CheckinFeedbackPanel apenas quando consultOpen === true
 *     (não dispara consulta/fetch enquanto fechado)
 *  3. consultOpen é state local (useState) — não derruba o estado da dieta
 *  4. não há early-return baseado em consultOpen
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

describe("ProtocolBuilder — painel de consulta (regressão)", () => {
  it("usa lazy() para CheckinFeedbackPanel", () => {
    expect(SRC).toMatch(/lazy\(\s*\(\)\s*=>\s*import\("\.\/CheckinFeedbackPanel"\)\s*\)/);
  });

  it("renderiza CheckinFeedbackPanel dentro de <Suspense>", () => {
    expect(SRC).toMatch(/<Suspense[\s\S]*?<CheckinFeedbackPanel/);
  });

  it("monta o painel apenas com consultOpen === true (evita fetch quando fechado)", () => {
    // padrão: {consultOpen && (<Suspense>...<CheckinFeedbackPanel/>)}
    expect(SRC).toMatch(/\{consultOpen\s*&&[\s\S]*?<CheckinFeedbackPanel/);
  });

  it("state consultOpen é local (useState boolean) — não derruba o estado da dieta", () => {
    expect(SRC).toMatch(/useState[<(][^)]*\)\s*[^;]*consultOpen|const\s*\[\s*consultOpen\s*,\s*setConsultOpen\s*\]\s*=\s*useState/);
  });

  it("não há early-return baseado em consultOpen no corpo do componente", () => {
    // se houvesse `if (consultOpen) return ...` o builder desmontaria
    expect(SRC).not.toMatch(/if\s*\(\s*consultOpen\s*\)\s*return/);
  });
});