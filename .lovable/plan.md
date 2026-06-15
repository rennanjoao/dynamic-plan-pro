## Análise — o que está realmente quebrado vs. o que já está correto

### 1. Medidas de braço — INCONSISTÊNCIAS CONFIRMADAS

- `src/lib/anamnesisSchema.ts` ✅ usa os 4 campos novos (`braco_d_relaxado`, `braco_e_relaxado`, `braco_d_contraido`, `braco_e_contraido`).
- `src/pages/Anamnesis.tsx` ✅ idem (linhas 185, 359-362).
- `src/lib/checkInSchema.ts` ❌ **Bug**: `CHECKIN_METRICS` (linha 18) declara `braco_d`, mas o payload salva `braco_d_relaxado` etc. → delta nunca calcula.
- `src/components/coach/EvolutionComparison.tsx` ❌ **Bug**: `EXTRA_METRICS` (linhas 28-32) usa `arm_relaxed`/`arm_flexed` (colunas legadas) e o `select` ainda lê essas colunas do banco (linhas 66, 68, 79-80, 95-96). Os 4 campos novos nunca aparecem na comparação.
- `src/components/anamnesis/AnamnesisViewer.tsx` ❌ **Bug**: linha 169 recalcula `baseline_metrics` lendo `braco_d`/`braco_e`, chaves que não existem mais em `editPayload`.

### 2. Compressão de fotos — AUSENTE

- `src/components/shared/FotoSlot.tsx` ❌ não tem compressão (nenhum `canvas`, `toBlob`, `quality`).
- `uploadToCloudinary` envia o `File` cru.
- `src/pages/Anamnesis.tsx` / `src/pages/CheckIn.tsx` chamam `uploadToCloudinary(f)` direto. Confirmado: sem compressão.

### 3. Pescoço — ✅ JÁ CORRETO

- `CHECKIN_METRICS` já contém `pescoco` (linha 14).
- `ProgressDashboard.tsx` já usa US Navy com `pescoco` (linhas 45-72, 146, 165).

### 4. Diretrizes minimizáveis (coach) — FALTA

- `GuidelinesTab` em `ProtocolBuilder.tsx` (linhas 415-430) renderiza 4 `Textarea` empilhados, sem colapso. Adicionar `Collapsible` por bloco.

### 5. Visão do aluno (treino) — ✅ JÁ COMPLETA

`StudentProtocolPreview.tsx` já exibe Séries, Reps, Descanso e Cadência por exercício (linhas 99-118). O schema de exercício só tem esses 4 campos (`sets`, `reps`, `rest`, `cadence`) + `notes`. Nada a mudar.

---

## Mudanças a aplicar

### A. `src/lib/checkInSchema.ts`
Substituir a entrada `braco_d` em `CHECKIN_METRICS` pelas 4 chaves novas (mantém o delta funcional):
```text
{ key: "braco_d_relaxado",  label: "Braço D Rel.",  unit: "cm" }
{ key: "braco_e_relaxado",  label: "Braço E Rel.",  unit: "cm" }
{ key: "braco_d_contraido", label: "Braço D Cont.", unit: "cm" }
{ key: "braco_e_contraido", label: "Braço E Cont.", unit: "cm" }
```
(Remover `braco_d` antigo. `coxa_d` mantém.)

### B. `src/components/coach/EvolutionComparison.tsx`
- Remover `arm_relaxed` / `arm_flexed` de `EXTRA_METRICS` (manter apenas `body_fat`).
- Remover essas colunas do `select(...)` em `anamnesis` e `check_ins`.
- Remover os 4 `if (… arm_relaxed != null)` / `arm_flexed`.
- Como os 4 campos novos já entram via `baseline_metrics` / `current_metrics` (rollup do payload) e o componente já itera `ALL_METRICS = [...CHECKIN_METRICS, ...EXTRA_METRICS]`, eles passam a aparecer automaticamente ao corrigir A.

### C. `src/components/anamnesis/AnamnesisViewer.tsx` (linha 169)
Trocar a lista no `forEach` para:
```text
["altura","peso","pescoco","cintura","quadril",
 "braco_d_relaxado","braco_e_relaxado","braco_d_contraido","braco_e_contraido",
 "coxa_d","coxa_e","pant_d","pant_e"]
```

### D. `src/components/shared/FotoSlot.tsx` — compressão Canvas
Adicionar `compressImage(file): Promise<File>`:
- Carrega em `<img>` via `URL.createObjectURL`.
- Calcula novas dimensões: lado maior = min(orig, 1200), mantém proporção.
- Desenha em `<canvas>`, `canvas.toBlob(blob => ..., "image/jpeg", 0.78)`.
- Se `blob.size >= file.size` ou erro → retorna `file` original.
- Caso contrário retorna `new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" })`.
- No `onChange` do input: `const f = await compressImage(e.target.files[0]); onFile(f);`
- Sem dependências externas, só Canvas API.

### E. `src/components/coach/ProtocolBuilder.tsx` — diretrizes minimizáveis
Em `GuidelinesTab`, envolver cada um dos 4 blocos (`training`, `diet`, `weekOrganization`, `supplementation`) num `Collapsible` (já disponível em `@/components/ui/collapsible`), com `CollapsibleTrigger` no rótulo do `Field` (chevron) e `CollapsibleContent` envolvendo o `Textarea`. Estado local `Record<string, boolean>` default todos abertos, persiste só durante a sessão.

---

## Fora do escopo (não mexer)

- `ProgressDashboard.tsx`, `ComparisonBoard.tsx` (já dinâmicos via `CHECKIN_METRICS`).
- `StudentProtocolPreview.tsx` (visão do aluno em treino já completa).
- Qualquer migração SQL (colunas `arm_relaxed`/`arm_flexed` legadas continuam no banco; só paramos de lê-las).
