/**
 * authErrors.ts — mensagens do login/cadastro em português e com o campo certo.
 *
 * O Supabase devolve as mensagens em inglês. Com a proteção de "senha vazada"
 * ativada no Lovable, uma senha conhecida em vazamentos é recusada com
 * "Password is known to be weak..." — antes isso virava "Erro ao criar conta."
 * sem dizer o motivo.
 */
export type AuthErrorField = "email" | "senha" | null;

export interface FriendlyAuthError {
  message: string;
  field: AuthErrorField;
}

type AuthErrLike = { message?: string; code?: string; status?: number } | null | undefined;

export function translateAuthError(err: AuthErrLike, fallback = "Não foi possível concluir. Tente de novo em instantes."): FriendlyAuthError {
  const msg = (err?.message ?? "").toLowerCase();
  const code = (err?.code ?? "").toLowerCase();

  if (code === "user_already_exists" || code === "email_exists" || msg.includes("already registered") || msg.includes("already been registered")) {
    return { field: "email", message: "Este e-mail já está cadastrado. Use outro e-mail ou entre com sua conta." };
  }
  if (code === "weak_password" || msg.includes("pwned") || msg.includes("leaked") || msg.includes("known to be weak") || msg.includes("weak password")) {
    return {
      field: "senha",
      message: "Essa senha aparece em listas de senhas vazadas na internet. Escolha outra, de preferência com letras, números e símbolos.",
    };
  }
  if (msg.includes("password should be at least") || msg.includes("password is too short")) {
    return { field: "senha", message: "A senha está curta demais. Use pelo menos 6 caracteres." };
  }
  if (code === "email_address_invalid" || msg.includes("invalid email") || msg.includes("unable to validate email") || msg.includes("email address") && msg.includes("invalid")) {
    return { field: "email", message: "Confira o e-mail digitado." };
  }
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || err?.status === 429 || msg.includes("rate limit")) {
    return { field: null, message: "Muitas tentativas seguidas. Aguarde um minuto e tente de novo." };
  }
  if (code === "same_password" || msg.includes("should be different from the old password")) {
    return { field: "senha", message: "A nova senha precisa ser diferente da atual." };
  }
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) {
    return { field: null, message: "E-mail ou senha incorretos." };
  }
  return { field: null, message: fallback };
}
