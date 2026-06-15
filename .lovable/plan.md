# BF% sempre automático

## Objetivo
Em todo lugar onde aparece "BF% estimado", o valor é **calculado a partir das medidas existentes** (US Navy: altura, pescoço, cintura, quadril p/ F + gênero). O aluno e o coach **não digitam** mais BF. Se faltar alguma medida, mostra um alerta pequeno abaixo do campo (ex.: "Faltam: pescoço, cintura"), mas **não bloqueia salvar/enviar**.

## Arquivos afetados

### 1. Novo helper compartilhado — `src/lib/bfEstimate.ts`
- Função única `estimateBF({ altura, cintura, pescoco, quadril, genero })` → `{ value: number | null, missing: string[] }`.
- Fórmula US Navy (já usada em `ProgressDashboard`); remove o branch `bodyFatRaw` (não usa mais valor digitado).
- `missing` lista as medidas obrigatórias ausentes/inválidas com label PT-BR.

### 2. `src/components/coach/MeasurementsEditor.tsx`
- Remover linha `body_fat` de `FIELDS` (não tem mais input de BF).
- Acima do bloco de Fotos, novo card "BF% estimado" (somente leitura) usando `BFDisplay` com o valor computado a partir dos `values` atuais + `payload.genero`. Abaixo do número, alerta pequeno (`text-[11px] text-amber-500`) listando medidas faltantes quando `value === null`.
- No `handleSave`, **não persistir** `body_fat` (deixa o helper recalcular sempre que for exibido). Coluna `body_fat` no DB permanece inalterada (sem migração).

### 3. `src/lib/anamnesisSchema.ts`
- Remover o field `{ key: "body_fat", label: "Estimativa BF%" }` de `ANAMNESIS_SECTIONS[composicao]`. (Form do aluno já não rendia esse field — limpeza só.)

### 4. `src/components/student/ComparisonBoard.tsx`
- Substituir `anamBF`/`checkBF` lidos de `payload.body_fat` por chamada a `estimateBF` usando `baseline_metrics` / `current_metrics` + `genero` do payload da anamnese.
- Sob cada `BFDisplay`, se `value` for null mostrar alerta discreto com `missing` (sem bloquear nada — é só leitura).

### 5. `src/components/coach/EvolutionComparison.tsx`
- Remover `body_fat` do `select(...)` em ambas queries (Supabase) e dos branches `if (anam.body_fat != null) ...`.
- Para cada `Timepoint`, computar `metrics.body_fat` via `estimateBF(metrics + genero)`. Gênero vem do `payload` da anamnese (busca única).
- Na tabela de medidas, se a linha `% Gordura` ficar `—`, anexar uma `<span>` com lista de medidas faltantes para o lado afetado.

### 6. `src/components/student/ProgressDashboard.tsx`
- Substituir `estimateBF` local por import do helper compartilhado.
- Remover leituras de `payload.body_fat`/`bodyFatRaw` (sempre estima).

## Fora de escopo
- Coluna `body_fat` no Supabase (não remover, sem migração).
- Lógica de billing, alertas diários, notify-coach.
- UI de Anamnese/Check-in do aluno (já não pedem BF).
- Configuração de feedback por aluno, colapsar diretrizes, preview de treino — já entregues.

## Verificação
- `bunx tsc --noEmit` limpo.
- Anamnese sem pescoço → ComparisonBoard mostra "—" + "Faltam: pescoço".
- Editor do coach: BF aparece logo após digitar pescoço/cintura/altura; envio funciona mesmo com BF nulo.
