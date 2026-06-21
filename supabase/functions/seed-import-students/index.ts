// ──────────────────────────────────────────────────────────────
// FUNÇÃO DESATIVADA POR SEGURANÇA.
//
// Este endpoint não é usado por nenhuma tela do site (o cadastro
// real do aluno é feito pelo fluxo de código de convite/acesso,
// via validate-invite-code / link-coach-student).
//
// Ele estava acessível publicamente na internet, sem exigir login,
// permitindo que qualquer pessoa criasse contas de usuário vinculadas
// a qualquer treinador. Foi desativado para fechar essa brecha.
//
// Se um dia precisar reativar para importação manual de alunos em
// massa, adicione checagem de admin (igual à função manage-trainers)
// antes de qualquer outra coisa.
// ──────────────────────────────────────────────────────────────

import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve((req: Request) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  return new Response(
    JSON.stringify({ error: "Função desativada." }),
    { status: 410, headers: { ...cors, "Content-Type": "application/json" } },
  );
});
