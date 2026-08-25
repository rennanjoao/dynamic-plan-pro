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

export async function importProtocolXlsx(file: File): Promise<ProtocolPayload> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const base = basePayload();
  const details: string[] = [];

  // Importar Refeições
  const wsMeals = wb.Sheets["Refeições"] || wb.Sheets["Dietas"];
  if (wsMeals) {
    const rows = XLSX.utils.sheet_to_json<any>(wsMeals);
    base.meals = rows.map((r) => {
      const dayLabel = String(r["Dia"] || r["Tipo de Dia"] || "").trim().toLowerCase();
      const day_type = dayLabel.includes("desc") || dayLabel === "rest"
        ? "rest"
        : dayLabel.includes("trein") || dayLabel === "training"
        ? "training"
        : "all";
      const rawPairId = String(r["Pair ID"] || r["pairId"] || "").trim();
      const rawExclude = String(r["Excluir do total geral"] || r["excludeFromDayTotal"] || "").trim().toLowerCase();
      const dayFields = {
        day_type,
        ...(rawPairId ? { pairId: rawPairId } : {}),
        excludeFromDayTotal: ["sim", "yes", "true", "1"].includes(rawExclude),
      };
      const buildOpts = (kind: "carb" | "protein" | "fat") => {
        const label = kind === "carb" ? "Carbo" : kind === "protein" ? "Prot" : "Gord";
        const opts: any[] = [];
        for (let oi = 0; oi < 2; oi++) {
          const items: any[] = [];
          for (let ii = 0; ii < 4; ii++) {
            const name = String(r[`${label} Op${oi + 1} Nome${ii + 1}`] || "").trim();
            const weight = String(r[`${label} Op${oi + 1} Peso${ii + 1}`] || "").trim();
            if (name || weight) items.push({ name, weight });
          }
          opts.push({
            kind,
            title: `Opção ${oi + 1}`,
            items: items.length ? items : [{ name: "", weight: "" }],
          });
        }
        return opts;
      };
      
      const buildSubs = (kind: "carb" | "protein" | "fat") => {
        const label = kind === "carb" ? "Carbo" : kind === "protein" ? "Prot" : "Gord";
        const out: any[] = [];
        for (let si = 0; si < 2; si++) {
          out.push({
            name: String(r[`Sub ${label} ${si + 1} Nome`] || "").trim(),
            weight: String(r[`Sub ${label} ${si + 1} Peso`] || "").trim(),
          });
        }
        return out;
      };

      if (r["Carboidratos"] || r["Proteínas"] || r["Gorduras"]) {
        return {
          name: String(r["Refeição"] || ""),
          time: String(r["Horário"] || ""),
          carbs: r["Carboidratos"] ? String(r["Carboidratos"]).split("|").map((s) => s.trim()).filter(Boolean) : [],
          proteins: r["Proteínas"] ? String(r["Proteínas"]).split("|").map((s) => s.trim()).filter(Boolean) : [],
          fats: r["Gorduras"] ? String(r["Gorduras"]).split("|").map((s) => s.trim()).filter(Boolean) : [],
          ...dayFields,
          notes: String(r["Observações"] || ""),
          macros: {
            carbs: Number(r["Carbs (g)"]) || Number(r["Carbo Macro(g)"]) || 0,
            protein: Number(r["Proteína (g)"]) || Number(r["Prot Macro(g)"]) || 0,
            fat: Number(r["Gordura (g)"]) || Number(r["Gord Macro(g)"]) || 0,
          },
        } as any;
      }
      return {
        name: String(r["Refeição"] || ""),
        time: String(r["Horário"] || ""),
        macros: {
          carbs: Number(r["Carbo Macro(g)"]) || 0,
          protein: Number(r["Prot Macro(g)"]) || 0,
          fat: Number(r["Gord Macro(g)"]) || 0,
        },
        options: [...buildOpts("carb"), ...buildOpts("protein"), ...buildOpts("fat")],
        substitutions: { carb: buildSubs("carb"), protein: buildSubs("protein"), fat: buildSubs("fat") },
        ...dayFields,
        notes: String(r["Observações"] || ""),
      } as any;
    });
  } else {
    details.push("Aba 'Refeições' não encontrada.");
  }

  // Importar Treinos
  const wsWorkouts = wb.Sheets["Treinos"];
  if (wsWorkouts) {
    const rows = XLSX.utils.sheet_to_json<any>(wsWorkouts);
    const grouped: Record<string, any> = {};
    rows.forEach((r) => {
      const k = r["Treino"];
      if (!k) return;
      if (!grouped[k]) grouped[k] = { key: String(k), focus: String(r["Foco"] || ""), exercises: [] };
      grouped[k].exercises.push({
        name: String(r["Exercício"] || ""),
        sets: String(r["Séries"] || ""),
        reps: String(r["Reps"] || ""),
        rest: String(r["Descanso"] || ""),
        notes: String(r["Técnica/Notas"] || ""),
        cadence: "",
      });
    });
    base.workouts = Object.values(grouped);
  }

  // Importar Aeróbicos
  const wsCardio = wb.Sheets["Aeróbicos"];
  if (wsCardio) {
    const rows = XLSX.utils.sheet_to_json<any>(wsCardio);
    base.cardio = rows.map(r => ({
      type: String(r["Tipo"] || ""),
      duration: String(r["Duração"] || ""),
      intensity: String(r["Intensidade"] || ""),
      associationType: (String(r["Associação (Treino/Dia)"] || "").toLowerCase().includes('treino') ? 'workout' : 'weekday') as 'workout' | 'weekday',
      workoutKey: String(r["Chave (A, B, seg...)"] || ""),
      notes: String(r["Observações"] || "")
    })).filter(c => c.type || c.duration);
  }

  // Importar Suplementos
  const wsSupp = wb.Sheets["Suplementos"];
  if (wsSupp) {
    const rows = XLSX.utils.sheet_to_json<any>(wsSupp);
    base.supplements = rows.map(r => ({
      name: String(r["Nome"] || ""),
      dose: String(r["Dose"] || ""),
      timing: String(r["Horário"] || ""),
      notes: String(r["Observações"] || "")
    })).filter(s => s.name || s.dose);
  }

  // Importar Ciclo
  const wsCycle = wb.Sheets["Ciclo"];
  if (wsCycle) {
    const rows = XLSX.utils.sheet_to_json<any>(wsCycle);
    base.carbCycle = {};
    const dayMap: Record<string, string> = { "Segunda": "mon", "Terça": "tue", "Quarta": "wed", "Quinta": "thu", "Sexta": "fri", "Sábado": "sat", "Domingo": "sun" };
    
    rows.forEach(r => {
      const label = String(r["Configuração"] || "").trim();
      const val = String(r["Valor (high/base/off)"] || "").trim();
      
      if (dayMap[label]) {
        (base.carbCycle as Record<string, "base" | "high" | "low" | "off">)[dayMap[label]] = (["base","high","low","off"].includes(val) ? val : "base") as "base" | "high" | "low" | "off";
      } else if (label === "ATIVO?") {
        base.setup.carbCycle = val.toUpperCase() === "SIM";
      } else if (label === "PCT ALTO (%)") {
        base.carbCycleHighPct = Number(val) || 15;
      } else if (label === "PCT BAIXO (%)") {
        base.carbCycleLowPct = Number(val) || 15;
      }
    });
  }

  // Importar Diretrizes
  const wsGuide = wb.Sheets["Diretrizes"];
  if (wsGuide) {
    const rows = XLSX.utils.sheet_to_json<any>(wsGuide);
    rows.forEach((r) => {
      const cat = String(r["Categoria"] || "").toLowerCase();
      const desc = String(r["Descrição"] || "");
      if (cat.includes("treino")) base.guidelines.training = desc;
      else if (cat.includes("dieta")) base.guidelines.diet = desc;
      else if (cat.includes("semana")) base.guidelines.weekOrganization = desc;
      else if (cat.includes("sono") || cat.includes("supl")) base.guidelines.supplementation = desc;
      else if (cat.includes("exibir") || cat.includes("visib")) base.showGuidelines = ["sim", "yes", "true", "1"].includes(desc.trim().toLowerCase());
    });
  }

  const safe = ProtocolPayloadSchema.safeParse(base);
  if (!safe.success) {
    throw new ProtocolXlsxError(
      "Planilha inválida",
      safe.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).concat(details)
    );
  }
  return safe.data;
}
