import { describe, it, expect } from "vitest";
import { slug } from "../slug";

describe("slug", () => {
  it("remove acentos", () => {
    expect(slug("Pão Integral")).toBe("pao-integral");
    expect(slug("Açaí com Granola")).toBe("acai-com-granola");
  });

  it("colapsa espaços em um único hífen, sem sobras nas pontas", () => {
    expect(slug("  Peito   de  Frango  ")).toBe("peito-de-frango");
    expect(slug("---abc---")).toBe("abc");
  });

  it("normaliza apóstrofos, parênteses e outros caracteres especiais", () => {
    expect(slug("Puxada (pegada aberta)")).toBe("puxada-pegada-aberta");
    expect(slug("Whey d'Isolado 100%")).toBe("whey-d-isolado-100");
    expect(slug("Supino Reto/Inclinado")).toBe("supino-reto-inclinado");
  });

  it("é estável para entradas vazias/inválidas", () => {
    expect(slug("")).toBe("");
    expect(slug(null)).toBe("");
    expect(slug(undefined)).toBe("");
  });
});