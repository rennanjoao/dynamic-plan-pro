/**
 * classifierParity.test.ts
 *
 * `src/lib/*` (Vite/React) e `supabase/functions/_shared/*` (Deno) mantêm
 * cópias físicas dos mesmos módulos de domínio, porque os dois runtimes não
 * compartilham bundle. Divergência silenciosa entre as cópias faria o coach e
 * a edge function classificarem o mesmo exercício de formas diferentes.
 *
 * Este teste falha se o conteúdo divergir. A comparação ignora:
 *   - linhas de comentário (`//`), que citam o caminho do par oposto;
 *   - o especificador de import (Deno exige extensão `.ts`, o frontend usa `@/`).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAIRS: Array<{ label: string; frontend: string; edge: string }> = [
  {
    label: "muscleGroupClassifier",
    frontend: "src/lib/muscleGroupClassifier.ts",
    edge: "supabase/functions/_shared/muscleGroupClassifier.ts",
  },
  {
    label: "volumeLandmarks",
    frontend: "src/lib/volumeLandmarks.ts",
    edge: "supabase/functions/_shared/volumeLandmarks.ts",
  },
];

function normalize(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"))
    // Neutraliza apenas o caminho do import (Deno vs alias do Vite).
    .map((line) => line.replace(/from\s+["'][^"']+["']/g, 'from "<module>"'))
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)
    .join("\n");
}

describe("paridade entre classificadores duplicados (frontend x edge function)", () => {
  for (const pair of PAIRS) {
    it(`${pair.label}: frontend e edge function estão em sincronia`, () => {
      const a = readFileSync(join(process.cwd(), pair.frontend), "utf8");
      const b = readFileSync(join(process.cwd(), pair.edge), "utf8");
      expect(normalize(b)).toBe(normalize(a));
    });
  }
});
