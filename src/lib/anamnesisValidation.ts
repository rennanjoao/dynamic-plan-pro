/**
 * anamnesisValidation.ts — conferências do cadastro/anamnese do aluno.
 *
 * Antes, nada era conferido no "Continuar": a aluna preenchia as 4 etapas e só
 * no "Finalizar" descobria que faltou o nome ou que a senha era curta — e o
 * app não a levava de volta ao campo. Agora a etapa 1 é conferida ao sair dela
 * e de novo no envio, sempre apontando o campo.
 */

export type Step1Field = "nome" | "email" | "senha" | "gender" | "altura" | "peso";

export interface StepIssue {
  field: Step1Field;
  message: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateAnamnesisStep1(input: {
  values: Record<string, unknown>;
  gender: string;
  /** Já tem conta (edição / logado) → e-mail e senha não são pedidos. */
  hasAccount: boolean;
}): StepIssue | null {
  const v = (k: string) => String(input.values[k] ?? "").trim();
  if (!v("nome")) return { field: "nome", message: "Preencha seu nome completo." };
  if (!input.hasAccount) {
    if (!v("email")) return { field: "email", message: "Preencha seu e-mail — é com ele que você vai entrar no app." };
    if (!EMAIL_RE.test(v("email"))) return { field: "email", message: "Confira o e-mail: parece que falta alguma parte (ex.: nome@gmail.com)." };
    const senha = String(input.values.senha ?? "");
    if (!senha) return { field: "senha", message: "Crie uma senha para acessar o app." };
    if (senha.length < 6) return { field: "senha", message: "A senha precisa ter pelo menos 6 caracteres." };
  }
  if (input.gender !== "F" && input.gender !== "M") return { field: "gender", message: "Selecione seu gênero." };
  if (!v("altura")) return { field: "altura", message: "Preencha sua altura — é base de todo o acompanhamento." };
  if (!v("peso")) return { field: "peso", message: "Preencha seu peso — é base de todo o acompanhamento." };
  return null;
}

/** Remove a senha antes de guardar o rascunho no aparelho. */
export function stripSecretsFromDraft<T extends Record<string, unknown>>(d: T): Omit<T, "senha"> {
  const rest: Record<string, unknown> = { ...d };
  delete rest.senha;
  return rest as Omit<T, "senha">;
}
