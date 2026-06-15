## Plano final — % Gordura Estimada

### Diagnóstico
O `+0.5%` em "Gordura estimada" é o delta entre o baseline (anamnese) e o último check-in. A fórmula atual em `ProgressDashboard.tsx` é simplificada (sem pescoço) e ainda aplica um ajuste por anos/nível de treino que distorce o resultado.

### Mudanças

**1. `src/components/student/ProgressDashboard.tsx`**
- Reescrever `estimateBF` com a fórmula baseada em pescoço/cintura/quadril/altura:
  - Homens: `495 / (1.0324 − 0.19077·log10(cintura − pescoço) + 0.15456·log10(altura)) − 450`
  - Mulheres: `495 / (1.29579 − 0.35004·log10(cintura + quadril − pescoço) + 0.22100·log10(altura)) − 450`
- Prioridade: `body_fat` digitado pelo aluno → fórmula → senão retorna `null` (UI mostra "—").
- Validações: `(W−N)` ou `(W+Hp−N)` precisam ser > 0; clamp 2–60%.
- **Remover** o ajuste por `anos_treino`/`nivel_treino` do cálculo — a informação continua salva na anamnese e visível ao coach, apenas não interfere mais no BF.
- Ler `pescoco` de `baseline_metrics.pescoco` (anamnese) e `current_metrics.pescoco` (check-ins).
- Label do card: manter "Gordura estimada"; badge de variação rotulado como "vs. início". **Sem mencionar "Marinha dos EUA"** em nenhum texto da UI.
- Quando faltarem dados (pescoço/cintura/quadril/altura), exibir "—" no card e ocultar a série "Gordura" do gráfico em vez de mostrar zeros.

**2. Nada muda em**
- `useMeasurements.ts` (já tem a fórmula correta com pescoço)
- Schemas de anamnese/check-in (campo `pescoco` já existe)
- `ComparisonBoard.tsx`, `EvolutionComparison.tsx`
- Visualização do coach (anos/nível de treino seguem aparecendo no `AnamnesisViewer`)

### Resultado
- Número principal = estimativa atual de %BF baseada em medidas reais (pescoço/cintura/quadril/altura).
- Badge abaixo = variação vs. baseline, com label "vs. início".
- Sem dados suficientes → "—", sem valor fake.
- Tempo/nível de treino segue registrado e acessível ao coach, mas fora da fórmula.
