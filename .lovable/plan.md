# Retomada das melhorias — Ondas 2, 3 e 4

Já concluído na sessão anterior (Onda 1): info-chat invoke, fix de flash de navegação, toggle tema claro/escuro, botão "Tenho uma dúvida" reposicionado em todos os cards.

A seguir, o que falta. Vou executar **uma onda por mensagem** para você revisar progressivamente. Esta plano cobre as 3 ondas; ao aprovar, começo pela **Onda 2**.

---

## Onda 2 — Coach: visualização e dados

### 2. Fotos do aluno na anamnese (painel do coach)
No `AnamnesisViewer` do coach, renderizar grid 2x2 clicável (frente, costas, lateral direita, lateral esquerda) com URLs do Cloudinary salvas no payload da anamnese. Modal de zoom ao clicar.

### 3. Email do coach via `profiles.email`
Garantir que `notify-coach` (e qualquer envio de e-mail disparado por `Anamnesis.tsx`, `CheckIn.tsx`, `ProtocolQuestionButton.tsx`) busque o e-mail do coach em `profiles.notification_email` (ou `profiles.email` se preferir) — não em `auth.users`. Ajustar a edge function para receber `coach_id` e resolver o e-mail via service role.

### 4. Gráfico de estimativa de % de gordura
Componente novo no `StudentDashboard` e no `AnamnesisViewer` do coach:
- Cálculo: Jackson & Pollock 3 ou 7 dobras quando houver dobras cutâneas; fallback para Marinha dos EUA (circunferências) ou Deurenberg (BMI+idade+sexo).
- Linha temporal: ponto inicial vindo da anamnese, pontos seguintes vindos de cada check-in.
- Gráfico `Recharts` (LineChart) com banda de meta opcional.

### 7. Card "Diretrizes e Suplementação"
Auditar o componente renderizador do protocolo de suplementação. Garantir que campos vazios não renderizem; substituir por estado "—" ou ocultar. Validar que `supplements_json`/`hydration` do protocolo ativo são lidos corretamente.

---

## Onda 3 — Monetização do coach (link externo, sem Stripe)

### 9. Cadastro do coach + trial 30 dias
- Página `/coach-register` (form: nome, e-mail, senha, telefone).
- Migration: coluna `trial_ends_at TIMESTAMPTZ` em `profiles` (default `now() + interval '30 days'` quando role = `coach`).
- Função `is_coach_trial_active(_user_id uuid)` SECURITY DEFINER.
- `CoachGuard`: se trial expirou e plano não está ativo, renderiza overlay desfocado com CTA para `/planos`.

### 10. Página `/planos` + link de pagamento configurável pelo admin
- Migration: nova tabela `app_settings (key text PK, value jsonb, updated_at)`. GRANTs corretos. RLS: `SELECT` para todos autenticados, `UPDATE/INSERT` apenas para role `admin`.
- Admin: aba "Pagamentos" com input para colar o link externo (Pix/cartão/boleto) — salva em `app_settings` chave `coach_payment_link`.
- `/planos`: mostra Mensal R$ 20, Semestral (R$ 108 ≈ 10% off), Anual (R$ 192 ≈ 20% off). Botão "Pagar agora" abre o link salvo em nova aba.
- Sem Stripe, sem webhooks. Renovação manual confirmada pelo admin (botão "Marcar como pago" estende `trial_ends_at`).

---

## Onda 4 — Dados e nova feature

### 11. Cascade delete + limpeza de órfãos
Migration única:
- `ON DELETE CASCADE` em todas as FKs que referenciam `auth.users(id)` (profiles, user_roles, coach_students, anamnesis, check_ins, protocols, coach_plans, player_doubts).
- `DELETE` de órfãos existentes (`coach_students` com `student_id`/`coach_id` sem usuário, anamnesis sem profile, etc).
- Trigger no `auth.users` AFTER DELETE só onde CASCADE não cobre.

### 12. Lista de Compras
- Nova aba "Lista de Compras" no `StudentArea` (após "Semana").
- Lê o protocolo ativo (`diet_strategy_json`) e extrai todos os alimentos por dia.
- Seletor de período: 1 / 7 / 15 / 30 dias.
- **Múltiplas opções de dieta**: seletor "Opção A / Opção B / Todas". Quando "Todas": deduplica por nome do alimento, **soma** quantidades quando o mesmo item aparece em opções do mesmo dia.
- Lista agrupada por categoria (carbo, proteína, gordura, vegetal, outros) com checkbox por item.
- Botão **Exportar PDF** (`jsPDF` + logo Elite Hub).
- Botão **WhatsApp** abrindo `wa.me` com texto formatado (emoji + categorias) conforme o template enviado.

---

## Detalhes técnicos transversais

- Todas as migrations seguem o padrão obrigatório: `CREATE TABLE` → `GRANT` → `ALTER ... ENABLE RLS` → `CREATE POLICY`.
- Toda lógica de e-mail/admin com privilégios usa `SECURITY DEFINER` ou `service_role` na edge function — nunca no client.
- Componentes novos seguem o design system (tokens HSL em `index.css`, `text-primary` para destaques vermelhos, glassmorphism nos cards).
- Pacote de mudanças por onda em uma única resposta; deploy das edge functions ao final de cada onda.

## Fora de escopo
- Stripe / pagamento integrado (decisão já foi "só link externo").
- Mudanças em fluxo de autenticação ou roles além das necessárias para o trial.
- Refatorações estéticas não pedidas.

---

**Aprove para eu começar pela Onda 2.** Cada onda termina com lista de arquivos alterados e o que testar.