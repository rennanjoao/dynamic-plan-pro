## Configuração de feedback por aluno + verificações

### 1. Migration — adicionar 3 campos em `coach_students`

```sql
ALTER TABLE public.coach_students
  ADD COLUMN IF NOT EXISTS feedback_interval_days integer DEFAULT 14,
  ADD COLUMN IF NOT EXISTS warning_days integer DEFAULT 14,
  ADD COLUMN IF NOT EXISTS critical_days integer DEFAULT 16;
```

Sem mudanças de RLS (políticas existentes já cobrem).

### 2. `useCoachStudents.ts`

- Mudar `select("student_id")` → `select("student_id, feedback_interval_days, warning_days, critical_days")`.
- Construir `Map<student_id, {warning, critical, interval}>`.
- Substituir `getAlertLevel(lastAnamnesis, lastFeedback, feedbackIntervalDays)` por nova assinatura:
  ```ts
  function getAlertLevel(lastFeedback, warningDays, criticalDays): AlertLevel {
    const d = daysSince(lastFeedback);
    if (d >= criticalDays) return "critical";
    if (d >= warningDays)  return "warning";
    return "ok";
  }
  ```
- Acrescentar em `StudentStatus`:
  - `warningDays: number`
  - `criticalDays: number`
  - `feedbackIntervalDays: number`
- Fallback: se valor da linha for null, usar o `feedbackIntervalDays` global passado ao hook (compat).
- Manter assinatura `useCoachStudents(coachId, feedbackIntervalDays = 7)` — não quebrar callers.

### 3. `CoachDashboard.tsx` — botão de config por aluno

- Importar `Settings2` de `lucide-react`.
- Em `StudentRow`, adicionar prop `onSettings(s)` e um botão `Settings2` na barra de ações à direita (ao lado de `History`, **sem remover nenhum botão existente**).
- Substituir os thresholds hardcoded no `feedbackLabel` colorido:
  ```
  daysSinceLastFeedback >= student.criticalDays → vermelho
  daysSinceLastFeedback >= student.warningDays  → laranja
  caso contrário → verde
  ```
- Novo componente `StudentFeedbackConfigDialog`:
  - 3 inputs numéricos (`feedback_interval_days`, `warning_days`, `critical_days`)
  - Validações leves: todos > 0; `critical_days >= warning_days`
  - Salva via `supabase.from("coach_students").update({...}).eq("coach_id", coachId).eq("student_id", studentId)`
  - `queryClient.invalidateQueries(["coach-students", ...])` ao sucesso
  - Defaults pré-preenchidos com os valores atuais do `StudentStatus` (ou 14/14/16).
- Configuração global (`feedback_interval_days` em `profiles`) **permanece intacta** como default sugerido.

### 4. Verificação dos itens já reportados como pendentes

- **Diretrizes minimizáveis** — código já implementado em `ProtocolBuilder.tsx` (linhas 414-462) com `openMap`/`toggle` e botão `ChevronDown`. Vou apenas validar visualmente após build; nenhuma alteração se já funcionar. Se o problema for que o usuário queria minimizar **enquanto edita treino**, isso é por design (cada aba mostra seu conteúdo) — não alterar.
- **Visão do aluno em treino com séries/reps/descanso/cadência** — código já presente em `StudentProtocolPreview.tsx` (linhas 100-124). Nenhuma alteração.

Em ambos: se after build verification mostrar falha, abrir nova rodada — fora do escopo deste plano.

### Arquivos editados

- nova migration
- `src/hooks/useCoachStudents.ts`
- `src/pages/CoachDashboard.tsx`

### Fora de escopo

Billing, daily_alerts, notify-coach, remoção de botões existentes.
