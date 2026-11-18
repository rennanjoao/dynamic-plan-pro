import { describe, expect, it } from "vitest";
import { validateProtocolForPublication } from "@/lib/protocolPublicationValidation";
import { blankProtocolPayload } from "@/lib/protocolCopy";

describe("aviso de Diretriz de treino oculta", () => {
  it("avisa quando a diretriz está escrita e oculta", () => {
    const p = { ...blankProtocolPayload(), showGuidelines: false } as any;
    p.guidelines = { ...p.guidelines, training: "Falha só na última série." };
    expect(validateProtocolForPublication(p).warnings.join(" ")).toMatch(/oculta para o aluno/);
  });
  it("não avisa quando está visível ou vazia", () => {
    const p = { ...blankProtocolPayload(), showGuidelines: true } as any;
    p.guidelines = { ...p.guidelines, training: "Falha só na última série." };
    expect(validateProtocolForPublication(p).warnings.join(" ")).not.toMatch(/oculta/);
    const vazio = { ...blankProtocolPayload(), showGuidelines: false } as any;
    expect(validateProtocolForPublication(vazio).warnings.join(" ")).not.toMatch(/oculta/);
  });
});
