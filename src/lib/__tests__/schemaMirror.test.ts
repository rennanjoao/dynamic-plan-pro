/**
 * schemaMirror.test.ts
 * Verifica que as colunas arm_relaxed, arm_flexed e body_fat estão
 * espelhadas em duas frentes (DB types gerados, migrations):
 *  - src/integrations/supabase/types.ts  (regenerado pela CLI após cada deploy)
 *  - supabase/migrations/*.sql           (DDL aplicada)
 *
 * IMPORTANTE: as 3 colunas NÃO são mais campos brutos de formulário — são
 * calculadas por src/components/coach/MeasurementsEditor.tsx a partir de
 * outros campos, e nunca digitadas diretamente pelo aluno:
 *  - arm_relaxed / arm_flexed = média D/E dos 4 campos por lado
 *    (braco_d_relaxado, braco_e_relaxado, braco_d_contraido, braco_e_contraido)
 *  - body_fat = estimateBF(altura, cintura, pescoco, quadril, gênero) —
 *    "BF% nunca é persistido [no payload]: é sempre recalculado a partir
 *    das medidas" (ver comentário em handleSave() no próprio editor)
 * Por isso o teste verifica os campos-FONTE em anamnesisSchema/checkInSchema,
 * não os nomes antigos. altura e gender só existem na Anamnese (linha de
 * base); o Check-in reaproveita esses dois da Anamnese e não os repete.
 *
 * Se a migration for revertida ou os types regenerados sem as colunas
 * calculadas, ou se um dos campos-fonte for removido dos formulários, este
 * teste falha e bloqueia o merge.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { ANAMNESIS_SECTIONS } from "../anamnesisSchema";
import { CHECKIN_METRICS } from "../checkInSchema";

const MIRROR_COLUMNS = ["arm_relaxed", "arm_flexed", "body_fat"] as const;
const TABLES = ["anamnesis", "check_ins"] as const;

// Campos-fonte que alimentam os cálculos acima (ver comentário no topo).
const ARM_SOURCE_FIELDS = ["braco_d_relaxado", "braco_e_relaxado", "braco_d_contraido", "braco_e_contraido"] as const;
const BF_SOURCE_FIELDS_ANAMNESIS = ["altura", "cintura", "pescoco", "quadril", "gender"] as const;
const BF_SOURCE_FIELDS_CHECKIN = ["cintura", "pescoco", "quadril"] as const;

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
  const anamnesisKeys = ANAMNESIS_SECTIONS.flatMap((s) => s.fields.map((f) => f.key));
  // As medidas corporais do check-in (cintura, braço por lado etc.) vivem em
  // CHECKIN_METRICS, um sub-form de medidas separado de CHECKIN_SECTIONS
  // (a lista de perguntas do check-in) — ver checkInSchema.ts.
  const checkinKeys = CHECKIN_METRICS.map((f) => f.key);

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

  it("anamnesisSchema expõe os campos-fonte de braço (para arm_relaxed/arm_flexed)", () => {
    for (const key of ARM_SOURCE_FIELDS) expect(anamnesisKeys).toContain(key);
  });

  it("checkInSchema expõe os campos-fonte de braço (para arm_relaxed/arm_flexed)", () => {
    for (const key of ARM_SOURCE_FIELDS) expect(checkinKeys).toContain(key);
  });

  it("anamnesisSchema expõe os campos-fonte de %BF (para body_fat)", () => {
    for (const key of BF_SOURCE_FIELDS_ANAMNESIS) expect(anamnesisKeys).toContain(key);
  });

  it("checkInSchema expõe os campos-fonte de %BF (para body_fat)", () => {
    for (const key of BF_SOURCE_FIELDS_CHECKIN) expect(checkinKeys).toContain(key);
  });
});
