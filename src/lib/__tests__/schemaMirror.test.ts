/**
 * schemaMirror.test.ts
 * Verifica que as colunas arm_relaxed, arm_flexed e body_fat estão
 * espelhadas em três frentes (DB types gerados, schema do app, migrations):
 *  - src/integrations/supabase/types.ts  (regenerado pela CLI após cada deploy)
 *  - src/lib/anamnesisSchema.ts          (form da anamnese)
 *  - src/lib/checkInSchema.ts            (form do check-in)
 *  - supabase/migrations/*.sql           (DDL aplicada)
 *
 * Se a migration for revertida ou os types regenerados sem as colunas,
 * este teste falha e bloqueia o merge.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ANAMNESIS_SECTIONS } from "../anamnesisSchema";
import { CHECKIN_SECTIONS } from "../checkInSchema";

const MIRROR_COLUMNS = ["arm_relaxed", "arm_flexed", "body_fat"] as const;
const TABLES = ["anamnesis", "check_ins"] as const;

function readTypes(): string {
  return readFileSync(join(process.cwd(), "src/integrations/supabase/types.ts"), "utf8");
}

function readMigrations(): string {
  const dir = join(process.cwd(), "supabase/migrations");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
}

describe("Schema mirror — colunas premium de composição corporal", () => {
  const types = readTypes();
  const migrations = readMigrations();

  for (const col of MIRROR_COLUMNS) {
    it(`types.ts referencia ${col}`, () => {
      expect(types).toMatch(new RegExp(`\\b${col}\\b`));
    });

    it(`migrations possuem ALTER/CREATE com ${col}`, () => {
      expect(migrations).toMatch(new RegExp(`\\b${col}\\b`));
    });
  }

  for (const table of TABLES) {
    it(`types.ts tem bloco da tabela ${table}`, () => {
      expect(types).toContain(`${table}: {`);
    });
  }

  it("anamnesisSchema expõe os 3 campos", () => {
    const allKeys = ANAMNESIS_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));
    for (const col of MIRROR_COLUMNS) expect(allKeys).toContain(col);
  });

  it("checkInSchema expõe os 3 campos", () => {
    const allKeys = CHECKIN_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));
    for (const col of MIRROR_COLUMNS) expect(allKeys).toContain(col);
  });
});