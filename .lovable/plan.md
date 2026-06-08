
# Refactoring DynamicPlan Pro — Painel do Coach

Plano dividido em 8 blocos, executados na ordem abaixo para reduzir risco (schema → lógica → UI → Supabase → telas do aluno).

---

## Bloco 1 — Schema + cálculo de macros

**Arquivos:** `src/lib/protocolSchema.ts`, novo `src/lib/macroCalc.ts`

- Adicionar `manualMacros` (opcional) em `MealFoodItemSchema`; manter o `z.preprocess` intacto para backward-compat.
- Exportar `MEAL_NAME_PRESETS`.
- Criar `src/lib/macroCalc.ts` com `calcMealMacros(meal)` e `calcDayMacros(meals[])` usando `TACO_FOODS` (importado de `src/data/tacoFoods.ts`). Regras:
  - `isTaco && rawWeight > 0` → `(rawWeight/100) × tacoNutrients` (energy = kcal).
  - `manualMacros` existe → soma direta.
  - Caso contrário → 0.

---

## Bloco 2 — DietTab refatorado (accordion + placar)

**Arquivo:** `src/components/coach/ProtocolBuilder.tsx`

- Placar `sticky top-0 z-10` com 4 barras (kcal/P/C/G) consumindo `calcDayMacros`. Meta = `payload.macros`. Barra fica vermelha quando atual > meta.
- Refeições viram accordion controlado (`openMealIndex` no state) — apenas uma aberta. Cabeçalho fechado mostra pílulas `Xp · Yc · Zg`; aberto mostra tag "editando".
- Nome da refeição com `<input list="meal-names">` + `<datalist>` de `MEAL_NAME_PRESETS`.
- Itens manuais (não-TACO) ganham linha inline com 4 inputs compactos `P / C / G / Kcal` → grava em `item.manualMacros`.
- Ícone ↔ (substituições) e lixeira por item; remover o `<details>` "Macros da refeição".
- Rodapé de cada refeição aberta: botões "Duplicar" e "Salvar como modelo" (bloco 6).

---

## Bloco 3 — Substituições inline

**Arquivo:** `src/components/coach/ProtocolBuilder.tsx` (helper novo em `macroCalc.ts`)

- Painel inline (não Modal/Sheet) abaixo do item ao clicar em ↔. State local por item.
- TACO: função `suggestTacoSubstitutes(item)` que filtra `TACO_FOODS` pelo mesmo `kind`, macro dominante ±15%, recalcula grama para equivalência, máx. 4 sugestões.
- Não-TACO: lista `meal.substitutions[kind]` cadastradas.
- Clique em sugestão substitui o item.

---

## Bloco 4 — Import/Export avançado + fuzzy match

**Arquivos:** `src/components/coach/ProtocolImportExport.tsx`, `src/lib/protocolXlsx.ts`

- Esconder os 4 botões dentro de `<Collapsible>` com trigger discreto "⚙ Modo avançado · JSON / Excel".
- Após import (JSON e XLSX), rodar `fuzzyMatchItems(meals)`:
  - Normaliza nome (lowercase, sem acento, sem "grelhado/cozido/assado").
  - Match via Levenshtein simplificado / includes contra `TACO_FOODS`.
  - Score ≥ 70% → marca `isTaco=true`, preenche `baseName`, parseia `weight` em `rawWeight` se necessário.
- Itens não casados abrem `<Dialog>` com lista + select TACO (Popover/Command) por item; botões "Confirmar e importar" e "Importar assim mesmo".
- Export JSON inclui novos campos (`manualMacros` etc.) com defaults.

---

## Bloco 5 — Treino: cadência + InfoPopovers

**Arquivo:** `src/pages/WorkoutPlan.tsx`

- Criar `InfoPopover` local com `TERM_INFO` (reps/cadence/rest).
- Grid do card de exercício passa a ser dinâmico: `grid-cols-3` quando `ex.cadence` vazio, `grid-cols-4` quando preenchido.
- Labels de Reps/Cadência/Descanso ganham ícone `Info` que abre `<Popover side="top">` (largura 220px). Sem migration.

---

## Bloco 6 — Drawer de anamnese no painel do coach

**Arquivos:** `src/lib/anamnesisSchema.ts`, `src/pages/CoachDashboard.tsx`

- Adicionar `braco_relaxado` e `braco_contraido` na seção `composicao` (JSONB, sem migration).
- Botão "Ver anamnese / feedback" abre `<Sheet side="right" w-[440px]>` com `<ScrollArea>` reutilizando `AnamnesisViewer`.
- Query: `from("anamnesis").select("payload, submitted_at").eq("student_id", id).order(...).limit(1).maybeSingle()`.

---

## Bloco 7 — Biblioteca de refeições (`meal_templates`)

**Migration + UI:**

```sql
CREATE TABLE public.meal_templates (
  id UUID PK DEFAULT gen_random_uuid(),
  coach_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'mixed',
  meal_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.meal_templates TO authenticated;
GRANT ALL ON public.meal_templates TO service_role;
ALTER TABLE ... ENABLE RLS;
-- policies: coach_id = auth.uid() para SELECT/INSERT/DELETE
```

- "Salvar como modelo": `<Dialog>` com nome (pré-preenchido) + select categoria, grava snapshot do `MealSchema`.
- "Carregar modelo" no header do DietTab: `<Dialog>` listando templates do coach com pílulas de macros; clique anexa nova refeição ao final.

---

## Bloco 8 — Lista de compras + histórico visual com BF%

### 8.1 ShoppingList (`src/pages/ShoppingList.tsx`)
- Bug fix: chave de agrupamento passa de `${kind}:${normalizeName(name)}` para `normalizeName(name)`.
- `parseGrams`: prioridade 1 = `rawWeight` numérico; prioridade 2 = parse do `weight` textual (g/kg/ml/l).
- `<Alert>` âmbar acima da lista: "Quantidades referem-se aos alimentos CRUS".

### 8.2 BF% (migration + schemas + UI)
```sql
ALTER TABLE anamnesis ADD COLUMN IF NOT EXISTS body_fat NUMERIC(4,1);
ALTER TABLE check_ins ADD COLUMN IF NOT EXISTS body_fat NUMERIC(4,1);
CREATE INDEX IF NOT EXISTS idx_check_ins_student_submitted
  ON check_ins (student_id, submitted_at DESC);
```
- Adicionar `body_fat` em `anamnesisSchema.ts` (composicao) e `checkInSchema.ts`.
- Novo `src/components/shared/BFDisplay.tsx`: valor com 1 decimal + `<Info>` → `<Popover>` com tabela ACE.

### 8.3 Aba "Evolução visual" no CoachDashboard
- Nova `<TabsTrigger>` ao lado das existentes.
- Topo: grid 2 colunas (foto inicial da anamnese × foto do check-in mais recente).
- Abaixo: grid 3 colunas com todos os check-ins (foto + data + peso + `BFDisplay`).
- Estados vazios quando faltam dados.

---

## Detalhes técnicos / regras transversais

- **Backward-compat:** `MealPreprocess` permanece intacto; todos os novos campos Zod usam `.optional()` ou `.default()`.
- **Sem libs novas:** uso de Popover, Sheet, Dialog, Collapsible, Alert, ScrollArea já existentes em `src/components/ui/`.
- **Macros 100% client-side** com `TACO_FOODS` em memória.
- **Tipos Supabase (`types.ts`)** são autogerados após as migrations — não editar manualmente.
- **Migrations:** apenas `meal_templates` (nova tabela com GRANTs + RLS) e `ALTER`s de `body_fat` / índice em check_ins. Demais campos (`cadence`, `braco_*`) vivem no JSONB.

---

## Ordem de execução

1. Schema + `macroCalc.ts`.
2. Migrations Supabase (meal_templates, body_fat, índice).
3. DietTab (placar + accordion + manualMacros + substituições inline).
4. ProtocolImportExport (Collapsible + fuzzy match + Dialog).
5. WorkoutPlan (InfoPopovers + cadência).
6. CoachDashboard (Sheet anamnese + aba Evolução visual + biblioteca de modelos).
7. ShoppingList (fix bug + alerta + parseGrams).
8. BFDisplay + integração nos viewers.

Cada bloco é commitável de forma independente; nenhum quebra dados existentes.
