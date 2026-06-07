## Plano de execução

### 1. Criar usuário admin
- Criar `rennanjoao@rjelitelab.com.br` (senha `010909`) via migration usando `auth.users` com `crypt()` + `email_confirmed_at = now()`.
- Inserir registros correspondentes em `public.profiles` e `public.user_roles` com `role = 'admin'`.

### 2. Corrigir e-mail em `supabase/functions/info-chat/index.ts`
- Linha ~11 do SYSTEM_PROMPT: `rjelitehub.com.br` → `rjelitelab.com.br`. Nada mais é alterado. Redeploy da função.

### 3. Corrigir e-mail em `supabase/functions/fitness-chat/index.ts`
- Duas ocorrências de `rennanjoao@elitelab.com.br` → `rennanjoao@rjelitelab.com.br`. Redeploy da função.

### 4. Remover dados públicos expostos
- Deletar `public/data/alunos.json` e `public/data/matheus.json`.
- Remover a pasta `public/data/` se ficar vazia.
- (Confirmado: nenhum import/fetch no `src/` referencia esses arquivos.)

### 5. Remover componentes órfãos de gamificação
- Deletar `src/components/gamification/ScoreCard.tsx` e `RankingTeaser.tsx`.
- Remover a pasta `src/components/gamification/`.
- (Confirmado via `rg`: nenhum import externo aponta para esses arquivos.)

### 6. `.gitignore`
- Já contém `.env`, `.env.*`, `!.env.example` (linhas 26-28). Nenhuma alteração.

### 7. Verificação do fluxo de e-mail aluno → coach (sem alterações de código)
Confirmação de que o sistema já funciona para **qualquer** professor cadastrado, não apenas o admin:

- **`notify-coach`** (linha 128) envia com `from: no-reply@rjelitelab.com.br` (domínio verificado no Resend) e `to: [body.coachEmail]` — o destinatário é dinâmico, recebido no payload. Não há allowlist nem hardcode de e-mail de coach.
- **`src/lib/notifyCoach.ts`** resolve `coachEmail` a partir de `profiles.notification_email` (ou `email` como fallback) do coach vinculado ao aluno via `coach_students`. Cada coach novo que se cadastrar e preencher seu `notification_email` no perfil receberá normalmente.
- **Vínculo aluno↔coach** ocorre via `get_coach_by_invite_code` + inserção em `coach_students` (status `active`), de modo que `anamnesis`, `check_ins` e perguntas disparam o notify para o coach correto.
- **RLS `coach_notifications`**: política `Students insert notifications to their coach` exige `auth.uid() = student_id` e relação ativa em `coach_students` — funciona para qualquer par coach/aluno legítimo.

Nada será editado nesses arquivos; apenas confirmação de funcionamento.

### Detalhes técnicos
- Não alterar `notify-coach`, `send-plan-email`, rotas, hooks ou componentes de auth.
- Após edição das edge functions, fazer deploy de `info-chat` e `fitness-chat`.
- Build será validado automaticamente para garantir que a remoção dos arquivos de gamificação não quebrou imports.
