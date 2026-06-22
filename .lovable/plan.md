## Estado atual confirmado (antes de mexer em código)

Já investiguei o que está deployado agora:

1. **Edge functions de chat respondem 200**
   - `POST /info-chat` → 200, resposta OK do Gemini.
   - `POST /fitness-chat` → 200, stream SSE chega com `gemini-2.5-flash`.
   - Logs das funções: só `booted` / `shutdown`, sem erros.

2. **RLS pós-migrations 2026-06-21 está correta para admin**
   - `profiles_admin_all` (FOR ALL) e `cs_admin_all` continuam ativas.
   - `user_roles` mantém `Admins can manage all roles`.
   - Banco tem 1 admin (`rennanjoao@rjelitelab.com.br`), 3 coaches, 3 users.

3. **`manage-trainers` (que alimenta o painel) usa service_role**
   - Não é bloqueada por RLS. Listaria os 6 não-admins normalmente.

4. **Auth logs mostram logout às 14:31** do próprio admin
   - Provavelmente o painel hoje está mostrando tela de login, não "vazio".

Ou seja: **não há evidência de regressão no banco nem nas funções**. Antes de mudar código, preciso isolar onde está o sintoma real.

## Etapa 1 – Confirmar o sintoma real com você (sem código)

Preciso de 3 informações para não chutar:

- **A.** No `app.eliteprimehub.com.br/admin`, depois de logar de novo com `rennanjoao@rjelitelab.com.br`, a aba "Profissionais" aparece vazia? E a aba "Vínculos"? Print/contagem do que aparece.
- **B.** No DevTools (F12 → Network) ao abrir a aba "Profissionais", qual o status e o body da chamada `manage-trainers` (action=list)? E da chamada `/profiles` (rest)?
- **C.** No chatbot: qual tela exatamente? (`/` landing → InfoChatBot, ou área logada → FitnessChatBot). Mensagem de erro/toast exato? Print do Network da chamada `info-chat` ou `fitness-chat`.

Sem isso eu não distingo: "logado-out", "cache antigo do bundle", "CORS rejeitando origem", ou "regressão real".

## Etapa 2 – Hipóteses ordenadas por probabilidade

Vou seguir nesta ordem só depois das respostas:

1. **Sessão expirada / logout**: explica os dois sintomas (admin redireciona para `/admin-login`, chatbot perde token se a rota exige auth). Fix: relogar; nenhuma mudança de código.
2. **Service Worker servindo bundle antigo** (já tivemos isso na correção de evolução): hard reload + bump de versão do `public/sw.js`.
3. **CORS bloqueando origem que mudou** (`_shared/cors.ts` só libera `*.lovable.app` + `app.eliteprimehub.com.br`). Se o domínio do produto ou um preview novo passou a usar outro host, ajustar `ALLOWED_ORIGINS`.
4. **Regressão nas RLS** (improvável — checado acima). Se Network mostrar 401/403 em `/rest/v1/profiles?...`, revisar políticas pontuais.
5. **GEMINI_API_KEY com quota/erro 4xx** mascarado: adicionar log do `response.status` e do body de erro nas duas edge functions; redeploy só dessas duas.

## Etapa 3 – Ações de código (somente as hipóteses confirmadas)

- Se hipótese 2: incrementar versão do cache em `public/sw.js` para forçar update.
- Se hipótese 3: adicionar o(s) origin(s) faltante(s) em `supabase/functions/_shared/cors.ts` e redeployar todas as edge functions afetadas.
- Se hipótese 4: ajustar policy específica via nova migration (com `GRANT` revisado).
- Se hipótese 5: melhorar o log de erro em `fitness-chat/index.ts` e `info-chat/index.ts`; relatório com o erro real do Gemini.

## Etapa 4 – Verificação

- Painel admin: contar linhas em "Profissionais" e "Vínculos" e comparar com banco (6 não-admins, N vínculos coach↔aluno).
- Chatbot: enviar "oi" e mostrar a resposta + status Network 200.
- Só então: nova publicação.

## O que preciso de você agora

Responda A, B, C da Etapa 1 (de preferência com prints do Network) antes de eu tocar em qualquer arquivo. Se preferir, posso começar pela hipótese 2 (cache/SW) sem risco — mas o ideal é ver o erro real primeiro para não ficarmos em loop de "tenta fixar".
