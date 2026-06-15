# Alimentos Industrializados + Cálculo Nutricional Coach/Aluno

## 1. Base de dados de industrializados (novo arquivo `src/data/industrialFoods.ts`)

Cria uma nova lista separada da TACO, mantendo a TACO como fonte primária. Cada item segue o mesmo formato (g/100g) para reaproveitar `calcMacros`:

```ts
export interface IndustrialFood extends TacoFood {
  brand: string;             // "Tirolez", "Itambé", "Betânia", "Genérico"
  source: "industrial";
  servingG?: number;         // porção referência do rótulo (ex: 30)
  saturatedFat?: number;     // g/100g
  sodium?: number;           // mg/100g
  lactoseFree?: boolean;
}
```

Itens cadastrados (valores convertidos da porção informada para por 100g):

| Nome | kcal | P | C | G | Sat | Na | Lactose-free |
|---|---|---|---|---|---|---|---|
| Requeijão Light Tirolez | 187 | 8.7 | 2.3 | 16.0 | 11.0 | 490 | — |
| Requeijão Light Itambé | 153 | 13.0 | 1.3 | 10.7 | 7.0 | 520 | — |
| Requeijão Tradicional Tirolez | 253 | 5.7 | 1.7 | 25.0 | 17.0 | 453 | — |
| Requeijão Zero Lactose Tirolez | 273 | 7.0 | 0.3 | 27.0 | 17.0 | 490 | ✓ |
| Requeijão Zero Lactose Light Betânia | 193 | 10.7 | 2.0 | 16.0 | — | — | ✓ |
| Creme de Arroz (genérico) | 370 | 7.0 | 82.0 | 0.5 | — | — | — |

`group` = `dairy` para requeijões; `carb` para creme de arroz.

## 2. Busca unificada com prioridade TACO

Em `src/data/tacoFoods.ts` (ou novo `src/lib/foodSearch.ts`):
- `searchFood(query)` retorna `{ taco: TacoFood[]; industrial: IndustrialFood[] }`.
- Resultados TACO aparecem primeiro; industrializados só aparecem quando o nome é explicitamente buscado (ex: "requeijão", "tirolez") ou quando não há TACO equivalente.
- Os pickers existentes (`TacoCalculatorDialog`, `ProtocolBuilder` item picker) passam a usar esta busca unificada, mostrando uma etiqueta `Industrializado · <marca>` quando aplicável.

## 3. Cálculo automático de kcal e macros

`src/lib/macroCalc.ts` já tem `calcItemMacros`, `calcMealMacros`, `calcDayMacros`. Ajustes:
- `calcItemMacros` passa a aceitar tanto `TacoFood` quanto `IndustrialFood` (busca em ambas as listas).
- Adiciona helper `optionMacros(option)` que soma os itens daquela opção (principal ou substituição) e retorna `{ kcal, p, c, g }`.
- Adiciona `compareOptions(main, alt)` retornando deltas absolutos e percentuais.

Tolerâncias para alertar coach (configuráveis em uma constante no topo do arquivo):
- ±10% kcal **ou** ±15% em qualquer macro → badge âmbar "Atenção".
- ±20% kcal **ou** ±30% em qualquer macro → badge vermelho "Desbalanceada".

## 4. Visão do Coach — `ProtocolBuilder`

No bloco de cada opção dentro de `MacroOptionsList` (linha ~1214) e no resumo da refeição (linha ~1135):
- Mostrar abaixo de cada **opção** (principal e substituições) uma linha compacta: `XX kcal · Pp · Cc · Gg`.
- Em substituições, anexar badge de delta vs. opção principal usando `compareOptions`. Cor segue a tolerância acima.
- O cabeçalho da refeição (já existe `mm.protein` etc.) ganha `kcal` total ao lado dos macros.

Nenhuma mudança nos campos manuais de macros da refeição — eles continuam editáveis pelo coach como meta; o cálculo automático aparece como leitura adicional.

## 5. Visão do Aluno — `StructuredMealsViewer`

Mantém exatamente como está: somente nome do alimento, peso e observações. **Não** exibir kcal/macros por opção nem por refeição. O `NutritionStrategyHeader` (totais do dia) continua igual — ele já é informação macro de alto nível, não detalhe por opção.

Garantir que campos de macro/kcal que possam ter sido adicionados ao item (`calcKcal`, etc.) **não vazem** no render do aluno. Auditar `MacroSection` para confirmar.

## 6. Onde o cálculo é disparado

- **Tempo real no `ProtocolBuilder`**: ao editar `weight`/`baseName`/trocar food, recalcular via `useMemo` sobre `option.items`.
- **Persistência**: NÃO armazenar kcal/macros calculados no `diet_strategy_json` (são derivados; ficam só em memória). Isso evita migração de dados.
- **Substituições**: as marcações de desbalanceamento são puramente client-side no painel do coach.

## 7. Arquivos a tocar

- `src/data/industrialFoods.ts` (novo)
- `src/lib/foodSearch.ts` (novo) — ou estender `tacoFoods.ts`
- `src/lib/macroCalc.ts` (adicionar `optionMacros`, `compareOptions`, suportar industrial)
- `src/components/coach/ProtocolBuilder.tsx` (kcal/macros por opção + badge de delta na substituição + kcal no cabeçalho)
- `src/components/student/tools/TacoCalculatorDialog.tsx` (Picker passa a usar `searchFood`)
- `src/components/student/StructuredMealsViewer.tsx` (auditoria — sem mudança visível ao aluno)

## 8. Fora de escopo

- Sem alterações de schema/DB.
- Sem mudanças no aluno além da auditoria (zero vazamento de kcal).
- Sem importação de planilha de industrializados — cadastro é via código.
- Sem alterações em billing, daily_alerts, RLS, anamnese ou check-in.

## 9. Verificação

- `bunx tsc --noEmit` limpo.
- Manualmente: criar refeição com requeijão + creme de arroz, conferir kcal/macros no painel do coach, abrir painel do aluno e confirmar que não aparecem números kcal/macros por opção.
