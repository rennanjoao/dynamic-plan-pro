## Problema confirmado

Hoje, no `/coach`, o botão "Evolução e Anamnese" do `StudentRow` abre o `EvolutionDialog`, que renderiza apenas `EvolutionComparison` (fotos + medidas comparadas). O componente que tem a **anamnese inteira editável** (`AnamnesisViewer`, com todas as ~50 perguntas + upload de fotos + Editar Avaliação) só é acessível pelo Sheet lateral do `ProtocolBuilder`.

Resultado: quando o coach clica em editar pela tela principal, vê só fotos/medidas, não o questionário completo.

## Mudanças

### 1. `src/pages/CoachDashboard.tsx` — Adicionar abas no EvolutionDialog
Transformar o conteúdo do `EvolutionDialog` em duas abas (shadcn `Tabs`):

- **Evolução** (padrão): `EvolutionComparisonLazy` (mantém o comportamento atual).
- **Anamnese completa**: novo `AnamnesisViewerLazy` (já existe em `ProtocolBuilder`). Trazer o mesmo `lazy(() => import("@/components/anamnesis/AnamnesisViewer"))` para o `CoachDashboard`.

Sem mexer em rotas, botões do `StudentRow`, alertas, billing ou notificações.

### 2. `src/components/anamnesis/AnamnesisViewer.tsx` — Edição com tipos corretos
Hoje, no modo edição, **todos** os campos viram `<textarea>`. Trocar pelo controle adequado lendo `f.type` / `f.options` do `ANAMNESIS_SECTIONS`:

- `type: "number"` (ou keys numéricas de `BASELINE_KEYS` — altura, peso, circunferências, meta_peso, meta_prazo) → `<Input type="number" step={f.step ?? "0.1"}>`.
- `f.options` definidos (selects como `meta_prioridade`, `nivel_treino`, `tem_academia`, etc.) → `<Select>` shadcn com as opções.
- `data_nasc`, `horario_dormir`, `horario_acordar` → `<Input type="date"|"time">` conforme o caso.
- Sliders de `NEURO_SLIDERS` → `<Slider min=0 max=10>` (se presentes no schema).
- Demais campos de texto livre → continuam como `<Textarea>`.

Helper interno `renderEditField(field, value, onChange)` para evitar duplicação. `handleSaveChanges` mantém-se igual (recalcula `baseline_metrics` a partir do `editPayload`).

### 3. Nada mais
- Não alterar `MeasurementsEditor`, `EvolutionComparison`, billing, `daily_alerts`, `notify-coach`, RLS, schema do DB.
- Não remover nenhum botão do `StudentRow`.
- `ProtocolBuilder` continua usando o mesmo `AnamnesisViewer` — ganha os tipos corretos de campo de brinde.

## Verificação

- `bunx tsc --noEmit` limpo.
- No `/coach`, abrir o botão "Evolução e Anamnese" → aparece aba **Anamnese completa** com todas as seções; clicar **Editar Avaliação / Fotos** permite editar todos os campos (number/select/date/textarea conforme o tipo) e salvar.
- Aba **Evolução** continua mostrando `EvolutionComparison` como antes.
