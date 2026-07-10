/**
 * ProtocolBuilderChangeEvent.test.ts
 *
 * Regressão estrutural (leitura do source) que trava três invariantes do
 * bloco que grava `protocol_change_events` dentro de `save()`:
 *   1. está num try/catch próprio, separado do try/catch principal do save
 *      (uma falha aqui não desfaz o UPDATE em `protocols`);
 *   2. não roda quando `opts.asDraft === true`;
 *   3. não roda no branch de criação de protocolo novo (o `else` de
 *      `isEditMode`) — só em UPDATE.
 *
 * Segue a mesma abordagem de `ProtocolBuilderSheet.test.ts`: parsear o
 * fonte porque um render de integração desse componente é frágil (925+
 * LOC, muitas deps Supabase e contexto auth).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = readFileSync(
  join(process.cwd(), "src/components/coach/ProtocolBuilder.tsx"),
  "utf8"
);

describe("ProtocolBuilder — gravação de protocol_change_events", () => {
  it("guarda a chamada por isEditMode && !opts.asDraft && publishActive", () => {
    // Não roda em rascunho e não roda em criação de protocolo novo.
    expect(SRC).toMatch(
      /if\s*\(\s*isEditMode\s*&&\s*protocolId\s*&&\s*coachId\s*&&\s*!opts\.asDraft\s*&&\s*publishActive\s*\)/
    );
  });

  it("está num try/catch próprio, com catch dedicado (evtErr)", () => {
    // O catch interno tem que existir e ser DIFERENTE do catch externo do save().
    expect(SRC).toMatch(/catch\s*\(\s*evtErr\s*\)\s*\{[\s\S]*?protocol_change_events/);
  });

  it("usa o módulo puro protocolChangeDetector (não faz o diff inline)", () => {
    expect(SRC).toMatch(/from\s+["']@\/lib\/protocolChangeDetector["']/);
    expect(SRC).toMatch(/detectProtocolChanges\s*\(/);
    expect(SRC).toMatch(/summarizeProtocolChanges\s*\(/);
  });

  it("não referencia protocol_change_events dentro do else de isEditMode (branch de criação)", () => {
    // Extrai o corpo do `else` do isEditMode do save() — do 'else {' logo
    // após o UPDATE em `protocols` até o fecho pareado.
    const marker = SRC.indexOf("if (isEditMode && protocolId) {");
    expect(marker).toBeGreaterThan(-1);
    const elseIdx = SRC.indexOf("} else {", marker);
    expect(elseIdx).toBeGreaterThan(-1);
    let depth = 1;
    let i = elseIdx + "} else {".length;
    for (; i < SRC.length && depth > 0; i++) {
      const ch = SRC[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
    }
    const elseBody = SRC.slice(elseIdx, i);
    expect(elseBody).not.toMatch(/protocol_change_events/);
    expect(elseBody).not.toMatch(/detectProtocolChanges/);
  });
});