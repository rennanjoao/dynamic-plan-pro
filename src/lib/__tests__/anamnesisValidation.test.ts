import { describe, expect, it } from "vitest";
import { stripSecretsFromDraft, validateAnamnesisStep1 } from "@/lib/anamnesisValidation";
import { translateAuthError } from "@/lib/authErrors";

const ok = { nome: "Ana", email: "ana@gmail.com", senha: "segredo1", altura: "165", peso: "62" };

describe("validateAnamnesisStep1", () => {
  it("tudo preenchido passa", () => {
    expect(validateAnamnesisStep1({ values: ok, gender: "F", hasAccount: false })).toBeNull();
  });
  it("aponta o primeiro campo que falta, na ordem da tela", () => {
    expect(validateAnamnesisStep1({ values: { ...ok, nome: " " }, gender: "F", hasAccount: false })?.field).toBe("nome");
    expect(validateAnamnesisStep1({ values: { ...ok, email: "ana@" }, gender: "F", hasAccount: false })?.field).toBe("email");
    expect(validateAnamnesisStep1({ values: { ...ok, senha: "123" }, gender: "F", hasAccount: false })?.field).toBe("senha");
    expect(validateAnamnesisStep1({ values: ok, gender: "", hasAccount: false })?.field).toBe("gender");
    expect(validateAnamnesisStep1({ values: { ...ok, altura: "" }, gender: "F", hasAccount: false })?.field).toBe("altura");
    expect(validateAnamnesisStep1({ values: { ...ok, peso: "" }, gender: "F", hasAccount: false })?.field).toBe("peso");
  });
  it("quem já tem conta não precisa de e-mail/senha", () => {
    expect(validateAnamnesisStep1({ values: { nome: "Ana", altura: "1", peso: "1" }, gender: "M", hasAccount: true })).toBeNull();
  });
});

describe("rascunho sem senha", () => {
  it("remove a senha e mantém o resto", () => {
    expect(stripSecretsFromDraft({ ...ok })).toEqual({ nome: "Ana", email: "ana@gmail.com", altura: "165", peso: "62" });
  });
});

describe("translateAuthError", () => {
  it("senha vazada (proteção do Lovable) vira mensagem clara no campo senha", () => {
    const r = translateAuthError({ code: "weak_password", message: "Password is known to be weak and easy to guess, please choose a different one." });
    expect(r.field).toBe("senha");
    expect(r.message).toMatch(/vazadas/);
  });
  it("e-mail já cadastrado aponta o campo e-mail", () => {
    expect(translateAuthError({ message: "User already registered" })).toMatchObject({ field: "email" });
  });
  it("login inválido em português", () => {
    expect(translateAuthError({ message: "Invalid login credentials" }).message).toBe("E-mail ou senha incorretos.");
  });
  it("erro desconhecido usa a mensagem padrão (nunca inglês cru)", () => {
    expect(translateAuthError({ message: "Something odd" }, "Padrão").message).toBe("Padrão");
  });
});
