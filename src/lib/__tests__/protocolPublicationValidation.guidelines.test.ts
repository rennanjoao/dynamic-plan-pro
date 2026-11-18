import { describe, expect, it } from "vitest";
import { validateProtocolForPublication } from "@/lib/protocolPublicationValidation";
import { blankProtocolPayload } from "@/lib/protocolCopy";
import type { ProtocolPayload } from "@/lib/protocolSchema";

type P = ProtocolPayload & { showGuidelines?: boolean };

describe("aviso de Diretriz de treino oculta", () => {
  it("avisa quando a diretriz está escrita e oculta", () => {
    const p = { ...blankProtocolPayload(), showGuidelines: false } as P;
    p.guidelines = { ...p.guidelines, training: "Falha só na última série." };
    expect(validateProtocolForPublication(p).warnings.join(" ")).toMatch(/oculta para o aluno/);
  });
  it("não avisa quando está visível ou vazia", () => {
    const p = { ...blankProtocolPayload(), showGuidelines: true } as P;
    p.guidelines = { ...p.guidelines, training: "Falha só na última série." };
    expect(validateProtocolForPublication(p).warnings.join(" ")).not.toMatch(/oculta/);
    const vazio = { ...blankProtocolPayload(), showGuidelines: false } as P;
    expect(validateProtocolForPublication(vazio).warnings.join(" ")).not.toMatch(/oculta/);
  });
});
