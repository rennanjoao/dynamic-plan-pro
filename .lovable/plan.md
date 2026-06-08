## O que já está pronto (não vou refazer)

- `cadence: string` opcional em `ExerciseSchema` ✅
- `body_fat` em `anamnesis`, `check_ins` e nos schemas TS ✅
- `BFDisplay` com Popover + tabela ACE (referência homem/mulher) ✅
- ShoppingList: `flatMap` → `reduce` chaveado por `normalizeName`, soma de gramas, `formatQty` com kg/g, Alert "alimentos CRUS" no topo ✅
- `QuickAnamnesisSheet` no `CoachDashboard` (Sheet lateral, lazy load) ✅
- `tacoGroupToKind` bloqueando alimento no card errado no `ProtocolBuilder` ✅
- `manualMacros`, `MEAL_NAME_PRESETS`, `baseName`/`rawWeight`/`isTaco` no `MealFoodItemSchema` ✅

## O que falta implementar

### 1. Banco e schemas TS
- Migration: adicionar `arm_relaxed numeric` e `arm_flexed numeric` em `anamnesis` e `check_ins`.
- `anamnesisSchema.ts`: o campo `braco_relaxado` e `braco_contraido` já existem como labels — renomear/normalizar chaves para `arm_relaxed`/`arm_flexed` (manter retrocompatibilidade lendo as duas chaves).
- `checkInSchema.ts`: adicionar `arm_relaxed`, `arm_flexed` na seção `final`.
- `types.ts`: refletir as colunas novas.

Observação: a tipagem `Protocol → meals → foods` com `macroCategory` é uma **quebra de contrato** com todo o app (StructuredMealsViewer, ProtocolBuilder, ShoppingList, Import/Export JSON/Excel). O modelo atual é `meals[].options[].kind + items[]`, onde `kind` já representa carbo/protein/fat. **Vou tratar `kind` como o `macroCategory` solicitado** (carbo→carb, protein→protein, fat→fat) em vez de migrar o schema inteiro — isso preserva a importação JSON/Excel conforme o requisito explícito do prompt. A categoria `free` é nova e será suportada apenas leitura no viewer.

### 2. ProtocolBuilder (Sheet de Anamnese/Feedback)
- Adicionar botão "Consultar Anamnese / Feedback" no header da aba de dieta.
- Abrir `Sheet` lateral direito carregando assincronamente `AnamnesisViewer` + últimos check-ins do aluno selecionado.
- Como o Sheet é portal, o formulário de dieta **não desmonta** — estado preservado.
- Suplementos e Observações da refeição já estão em `<details>`/Accordion? Vou verificar e envolver em `Collapsible` se ainda estiverem inline.

### 3. DietCard premium
Reescrever `src/components/fitness/DietCard.tsx` com a árvore exata:
```
Header: ☀️ Nome · Horário · Badge CRU/COZIDO
↓ Grupo CARBO (azul) — título "ESCOLHA UM CARBOIDRATO"
↓ Grupo PROTEÍNA (vermelho) — "ESCOLHA UMA PROTEÍNA"
↓ Grupo GORDURA (amarelo) — "ESCOLHA UMA GORDURA"
↓ Rodapé: Observações + Suplementos (bg neutro)
```
Como `DietCard.tsx` atual é genérico (legado), vou também adaptar `StructuredMealsViewer.tsx` que é o realmente usado pelo aluno — esse já tem cores por kind, vou reforçar contraste e títulos.

### 4. WorkoutCard premium
- Cabeçalho de colunas: `Série | Repetições | Cadência | Descanso | Obs`
- Cada título com `<Info size={14}>` em Popover com definição técnica.
- Aplicar em `WorkoutPlan.tsx` (já tem grid dinâmico baseado em `cadence` da sessão passada).

### 5. Evolução grid 2 col
- Em `Evolution.tsx`: grid `grid-cols-2 gap-4` com foto frontal anamnese (col 1) vs foto frontal check-in selecionado (col 2). BFDisplay ao lado do valor.

## Riscos
- Renomear chaves `braco_relaxado` → `arm_relaxed` quebra anamneses já gravadas. Vou manter **dual-read** (escreve nova, lê ambas) e não migrar dados existentes.
- Tipagem `macroCategory` literal exigida pelo prompt vs `kind` atual: vou expor um getter `macroCategory(option)` para o DietCard sem alterar persistência.

## Pergunta antes de codificar
Tudo isso são ~7 arquivos editados + 1 migration. Confirma que quer que eu execute na sequência, ou prefere fatiar em 3 etapas (1: DB+schemas, 2: Sheet+Builder, 3: DietCard+WorkoutCard+Evolução)?
