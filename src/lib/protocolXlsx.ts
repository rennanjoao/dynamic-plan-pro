import * as XLSX from "xlsx";
import { ProtocolPayloadSchema, type ProtocolPayload } from "./protocolSchema";

export class ProtocolXlsxError extends Error {
  details: string[];
  constructor(message: string, details: string[] = []) {
    super(message);
    this.name = "ProtocolXlsxError";
    this.details = details;
  }
}

function basePayload(): ProtocolPayload {
  return ProtocolPayloadSchema.parse({
    setup: { split: "ABC", mealsCount: 5, carbCycle: false },
  });
}

function getOpt(meal: any, kind: "carb" | "protein" | "fat", idx: number) {
  const opts = (meal.options ?? []).filter((o: any) => o?.kind === kind);
  return opts[idx] ?? { title: "", items: [] };
}

function itemAt(opt: any, idx: number) {
  const it = opt?.items?.[idx];
  return { name: it?.name ?? "", weight: it?.weight ?? "" };
}

function subAt(meal: any, kind: "carb" | "protein" | "fat", idx: number) {
  const arr = meal.substitutions?.[kind] ?? [];
  const s = arr[idx];
  if (!s) return { name: "", weight: "" };
  if (typeof s === "string") return { name: s, weight: "" };
  return { name: s?.name ?? "", weight: s?.weight ?? "" };
}

export function exportProtocolXlsx(payload: ProtocolPayload, studentName: string) {
  const wb = XLSX.utils.book_new();

  // 1. Aba de Refeições
  const mealsData = payload.meals.map((m: any) => {
    const row: Record<string, any> = {
      "Refeição": m.name,
      "Horário": m.time,
      "Carbo Macro(g)": m.macros?.carbs ?? 0,
      "Prot Macro(g)": m.macros?.protein ?? 0,
      "Gord Macro(g)": m.macros?.fat ?? 0,
    };
    (["carb", "protein", "fat"] as const).forEach((kind) => {
      const label = kind === "carb" ? "Carbo" : kind === "protein" ? "Prot" : "Gord";
      for (let oi = 0; oi < 2; oi++) {
        const opt = getOpt(m, kind, oi);
        for (let ii = 0; ii < 4; ii++) {
          const it = itemAt(opt, ii);
          row[`${label} Op${oi + 1} Nome${ii + 1}`] = it.name;
          row[`${label} Op${oi + 1} Peso${ii + 1}`] = it.weight;
        }
      }
    });
    (["carb", "protein", "fat"] as const).forEach((kind) => {
      const label = kind === "carb" ? "Carbo" : kind === "protein" ? "Prot" : "Gord";
      for (let si = 0; si < 2; si++) {
        const s = subAt(m, kind, si);
        row[`Sub ${label} ${si + 1} Nome`] = s.name;
        row[`Sub ${label} ${si + 1} Peso`] = s.weight;
      }
    });
    row["Dia"] = m.day_type === "training" ? "Treino" : m.day_type === "rest" ? "Descanso" : "Todos";
    row["Pair ID"] = m.pairId || "";
    row["Excluir do total geral"] = m.excludeFromDayTotal ? "SIM" : "NAO";
    row["Observações"] = m.notes || "";
    return row;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mealsData), "Refeições");

  // 2. Aba de Treinos
  const workoutsData = payload.workouts.flatMap((w) =>
    w.exercises.map((e) => ({
      "Treino": w.key,
      "Foco": w.focus,
      "Exercício": e.name,
      "Séries": e.sets,
      "Reps": e.reps,
      "Descanso": e.rest,
      "Técnica/Notas": e.notes,
    }))
  );
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(workoutsData), "Treinos");

  // 3. Aba de Aeróbicos (Cardio)
  const cardioData = (payload.cardio || []).map((c) => ({
    "Tipo": c.type || "",
    "Duração": c.duration || "",
    "Intensidade": c.intensity || "",
    "Associação (Treino/Dia)": c.associationType === 'workout' ? 'Treino' : 'Dia',
    "Chave (A, B, seg...)": c.workoutKey || "",
    "Observações": c.notes || ""
  }));
  if (cardioData.length > 0 || (payload.cardio && payload.cardio.length === 0)) {
     XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cardioData.length ? cardioData : [{ "Tipo": "", "Duração": "", "Intensidade": "", "Associação (Treino/Dia)": "", "Chave (A, B, seg...)": "", "Observações": "" }]), "Aeróbicos");
  }

  // 4. Aba de Suplementos
  const suppData = (payload.supplements || []).map((s) => ({
    "Nome": s.name || "",
    "Dose": s.dose || "",
    "Horário": s.timing || "",
    "Observações": s.notes || ""
  }));
  if (suppData.length > 0 || (payload.supplements && payload.supplements.length === 0)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(suppData.length ? suppData : [{ "Nome": "", "Dose": "", "Horário": "", "Observações": "" }]), "Suplementos");
  }

  // 5. Aba de Ciclo de Carbo
  const days = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
  const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  const cycleData: Array<{ Configuração: string; "Valor (high/base/off)": string }> = dayKeys.map((key, i) => ({
    "Configuração": days[i],
    "Valor (high/base/off)": (payload.carbCycle?.[key as keyof typeof payload.carbCycle] as string) || "base"
  }));
  cycleData.push({ "Configuração": "ATIVO?", "Valor (high/base/off)": payload.setup?.carbCycle ? "SIM" : "NAO" });
  cycleData.push({ "Configuração": "PCT ALTO (%)", "Valor (high/base/off)": String(payload.carbCycleHighPct || 15) });
  cycleData.push({ "Configuração": "PCT BAIXO (%)", "Valor (high/base/off)": String(payload.carbCycleLowPct || 15) });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cycleData), "Ciclo");

  // 6. Aba de Diretrizes Gerais
  const g = payload.guidelines;
  const guideData = [
    { Categoria: "Treino", Descrição: g.training },
    { Categoria: "Dieta", Descrição: g.diet },
    { Categoria: "Semana", Descrição: g.weekOrganization },
    { Categoria: "Sono", Descrição: g.supplementation },
    { Categoria: "Exibir Diretrizes para o aluno", Descrição: payload.showGuidelines ? "SIM" : "NAO" },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(guideData), "Diretrizes");

  const safe = (studentName || "aluno").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  XLSX.writeFile(wb, `protocolo-${safe}.xlsx`);
}

// importProtocolXlsx foi removida de propósito: a leitura de .xlsx enviado
// pelo usuário passava por XLSX.read(), que é exatamente a função afetada
// pelas falhas conhecidas do SheetJS (CVE-2023-30533 prototype pollution,
// CVE-2024-22363 ReDoS) — sem correção publicada no npm até hoje. Exportar
// (acima) usa só as funções de escrita (json_to_sheet/writeFile), que não
// são afetadas por essas CVEs. Se precisar reimportar de Excel no futuro,
// use uma lib mantida (ex.: read-excel-file) em vez de reintroduzir isto.
