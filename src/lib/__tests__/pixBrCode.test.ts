import { describe, it, expect } from "vitest";
import { buildPixBrCode } from "../pixBrCode";

describe("buildPixBrCode", () => {
  it("gera payload válido com chave + valor", () => {
    const code = buildPixBrCode({
      pixKey: "rennan@example.com",
      amount: 99.9,
      merchantName: "Rennan Joao",
      merchantCity: "Sao Paulo",
      txId: "FIN123",
    });
    expect(code.startsWith("000201")).toBe(true);
    expect(code).toContain("br.gov.bcb.pix");
    expect(code).toContain("rennan@example.com");
    expect(code).toContain("5303986");
    expect(code).toContain("540599.90");
    // CRC presente no final (4 chars hex)
    expect(/6304[0-9A-F]{4}$/.test(code)).toBe(true);
  });

  it("omite valor quando não fornecido", () => {
    const code = buildPixBrCode({
      pixKey: "12345678900",
      merchantName: "Recebedor",
      merchantCity: "Brasil",
    });
    expect(code).not.toContain("5404");
    expect(code).not.toContain("5405");
  });

  it("sanitiza acentos e limita tamanho do nome/cidade", () => {
    const code = buildPixBrCode({
      pixKey: "x@y.com",
      merchantName: "João da Silva Pereira do Nome Muito Longo",
      merchantCity: "São José dos Pinhais MG",
    });
    expect(code).toContain("Joao");
    expect(code).not.toMatch(/[ãõçé]/);
  });
});