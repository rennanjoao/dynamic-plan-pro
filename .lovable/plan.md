## Problema

O botão "Ver como aluno" no ProtocolBuilder sempre abre `StudentProtocolPreview` exibindo apenas o Treino, independente da aba que o coach está editando (Macros, Diretrizes, Treino, Dieta ou Semana).

## Objetivo

A pré-visualização deve refletir o contexto atual:
- Editando **Macros** → preview dos macros (calorias, P/C/G, água) como o aluno vê
- Editando **Diretrizes** → preview do bloco de diretrizes
- Editando **Treino** → preview de treinos + aeróbicos (comportamento atual)
- Editando **Dieta** → preview das refeições (estrutura StructuredMealsViewer-like)
- Editando **Semana** → preview do ciclo semanal (dias alto/baixo, treinos por dia)

## Mudanças

### 1. `src/components/coach/ProtocolBuilder.tsx`
- Converter a `<Tabs defaultValue="macros">` em controlled (`value={activeTab}` + `onValueChange={setActiveTab}`) com novo state `activeTab`.
- Passar `section={activeTab}` para `<StudentProtocolPreview>`.
- Atualizar o label do botão para refletir contexto: `Ver como aluno — {labelDaAba}`.

### 2. `src/components/coach/StudentProtocolPreview.tsx`
- Aceitar nova prop `section: "macros" | "guidelines" | "workouts" | "diet" | "cycle"` (default `"workouts"` para retrocompat).
- Renderizar apenas o bloco correspondente:
  - **macros**: cards com `payload.macros` (calorias, proteína, carbo, gordura, água, meta) no mesmo estilo que o aluno vê na rotina dinâmica.
  - **guidelines**: lista de `payload.guidelines` (cardio/suplementos/observações) em cartões.
  - **workouts**: bloco atual (accordion de treinos + aeróbicos vinculados + cardio global).
  - **diet**: refeições (`payload.meals`) com opções de carbo/proteína/gordura e observações — espelhando `StructuredMealsViewer` em forma simplificada inline (sem reusar o componente para evitar dependências de toolbar).
  - **cycle**: tabela semanal de `payload.week` (dia da semana → treino atribuído + alto/baixo carbo se ativo).
- Título do Sheet muda dinamicamente ("Visão do Aluno — Treino", "— Dieta", etc).

### Nada mais é alterado
- Schemas, `StudentArea`, `DynamicRoutine`, `WorkoutPlan` permanecem intactos.
- Lógica de salvamento, sincronização com `coach_plans` e abas internas não muda.

## Detalhes técnicos

- `activeTab` inicial = `"macros"` (mesmo default atual).
- Mapeamento label: `macros→Macros`, `guidelines→Diretrizes`, `workouts→Treino`, `diet→Dieta`, `cycle→Semana`.
- Preview de Dieta lê `payload.meals` (array com `name`, `time`, `carbOptions`, `proteinOptions`, `fatOptions`, `notes`) — formatando cada opção com nome+peso, igual à visão do aluno.
- Preview de Semana lê `payload.week` (estrutura existente com `weekdays`/`carbCycle`).
- Sem novas dependências, sem migrações de banco.
