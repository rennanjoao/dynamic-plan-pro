/**
 * protocolChangeDetector.ts
 *
 * Regras puras (síncronas, sem I/O) para detectar as mudanças que um coach
 * fez em um protocolo entre um estado ANTERIOR e um POSTERIOR, e para
 * decidir a mensagem final que o aluno vê em `protocol_change_events`.
 *
 * A responsabilidade está separada em duas funções:
 *
 * - `detectProtocolChanges(prev, next)` → comparador puro. Recebe dois
 *   payloads de protocolo e devolve o array bruto de mudanças, sem casos
 *   especiais. É o que os testes unitários cobrem célula a célula.
 *
 * - `summarizeProtocolChanges({ wasInactive, changes })` → aplica os casos
 *   especiais que dependem de contexto externo ao diff:
 *     • se o protocolo estava inativo e agora foi liberado, o aluno recebe
 *       um único evento "protocolo foi liberado";
 *     • se o diff produziu >8 itens, colapsa em um único evento
 *       "protocolo foi totalmente atualizado";
 *     • caso contrário devolve o array como está.
 *
 * Toda a lógica de gramática/labels em português continua aqui — o
 * `ProtocolBuilder` só chama essas duas funções e grava o resultado.
 */
import { slug } from "./slug";

export type ChangeCategory = "treino" | "dieta" | "suplemento" | "diretriz" | "geral";
export type ChangeImportance = "alta" | "media" | "baixa";
export type ChangeTargetTab = "treino" | "dieta" | "suplementos" | null;

export interface ProtocolChange {
  category: ChangeCategory;
  importance: ChangeImportance;
  label: string;
  target_tab: ChangeTargetTab;
  target_anchor: string | null;
  /**
   * Texto secundário exibido quando o aluno expande o item no card de
   * atualizações. Descreve o que exatamente mudou (ex: "Séries: 3 → 4"),
   * ou `null` quando não há detalhe adicional útil (ex: refeição removida).
   */
  detail: string | null;
}

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

type AnyRec = Record<string, any>;

// Rótulos e unidades espelhados do ProtocolBuilder (aba de Macros).
const MACRO_LABEL: Record<string, { label: string; unit: string }> = {
  calories: { label: "Calorias", unit: "kcal" },
  protein:  { label: "Proteína", unit: "g" },
  carbs:    { label: "Carbo",    unit: "g" },
  fat:      { label: "Gordura",  unit: "g" },
  water:    { label: "Água",     unit: "L" },
};

/**
 * Comparador puro. Não conhece "primeira ativação" nem o teto de >8 itens
 * — quem chama decide como resumir o resultado (ver `summarizeProtocolChanges`).
 */
export function detectProtocolChanges(
  prev: AnyRec | null | undefined,
  next: AnyRec | null | undefined
): ProtocolChange[] {
  const out: ProtocolChange[] = [];
  if (!prev || !next) return out;

  // ─────────── MACROS ───────────
  const pm: AnyRec = prev.macros ?? {};
  const nm: AnyRec = next.macros ?? {};
  const macroFields = ["calories", "protein", "carbs", "fat", "water"] as const;
  const changedMacroParts: string[] = [];
  for (const k of macroFields) {
    if (n(pm[k]) !== n(nm[k])) {
      const meta = MACRO_LABEL[k];
      changedMacroParts.push(`${meta.label}: ${n(pm[k])}${meta.unit} → ${n(nm[k])}${meta.unit}`);
    }
  }
  if (changedMacroParts.length > 0) {
    out.push({
      category: "dieta",
      importance: "media",
      label: "Suas metas de calorias e macros foram ajustadas",
      target_tab: "dieta",
      target_anchor: null,
      detail: changedMacroParts.join(" · "),
    });
  }
  if (s(pm.goal) !== s(nm.goal)) {
    out.push({
      category: "dieta",
      importance: "media",
      label: "Seu objetivo foi atualizado",
      target_tab: "dieta",
      target_anchor: null,
      detail: `Antes: ${s(pm.goal) || "—"} · Agora: ${s(nm.goal) || "—"}`,
    });
  }

  // ─────────── DIRETRIZ (apenas training) ───────────
  const pTraining = s(prev?.guidelines?.training);
  const nTraining = s(next?.guidelines?.training);
  const pShow = Boolean(prev?.showGuidelines);
  const nShow = Boolean(next?.showGuidelines);
  if (!pShow && nShow && nTraining) {
    out.push({
      category: "diretriz",
      importance: "media",
      label: "Novas diretrizes de treino foram liberadas para você",
      target_tab: "treino",
      target_anchor: "guideline-training",
      detail: nTraining,
    });
  } else if (pTraining !== nTraining) {
    out.push({
      category: "diretriz",
      importance: "baixa",
      label: "A diretriz de treino foi atualizada",
      target_tab: "treino",
      target_anchor: "guideline-training",
      detail: nTraining || null,
    });
  }

  // ─────────── WORKOUTS (por day.key) ───────────
  const pw: AnyRec[] = Array.isArray(prev.workouts) ? prev.workouts : [];
  const nw: AnyRec[] = Array.isArray(next.workouts) ? next.workouts : [];
  const pDays = new Map<string, AnyRec>(pw.map((d) => [String(d.key), d]));
  const nDays = new Map<string, AnyRec>(nw.map((d) => [String(d.key), d]));

  for (const [key, day] of nDays) {
    if (!pDays.has(key)) {
      const exNames = (Array.isArray(day.exercises) ? day.exercises : [])
        .map((e: AnyRec) => s(e.name))
        .filter(Boolean);
      out.push({
        category: "treino",
        importance: "alta",
        label: `Um novo dia de treino foi adicionado: ${s(day.focus) || key}`,
        target_tab: "treino",
        target_anchor: null,
        detail: exNames.length > 0 ? exNames.join(", ") : null,
      });
    }
  }
  for (const [key, day] of pDays) {
    if (!nDays.has(key)) {
      out.push({
        category: "treino",
        importance: "alta",
        label: `O treino de ${s(day.focus) || key} foi removido`,
        target_tab: "treino",
        target_anchor: null,
        detail: null,
      });
    }
  }

  for (const [key, dOld] of pDays) {
    const dNew = nDays.get(key);
    if (!dNew) continue;
    const oldEx: AnyRec[] = Array.isArray(dOld.exercises) ? dOld.exercises : [];
    const newEx: AnyRec[] = Array.isArray(dNew.exercises) ? dNew.exercises : [];
    const oldNames = oldEx.map((e) => s(e.name)).filter(Boolean);
    const newNames = newEx.map((e) => s(e.name)).filter(Boolean);
    const oldSet = new Set(oldNames);
    const newSet = new Set(newNames);
    const removed = oldNames.filter((nm) => !newSet.has(nm));
    const added = newNames.filter((nm) => !oldSet.has(nm));

    const anchorFor = (nm: string) => `workout-${key}-exercise-${slug(nm)}`;

    if (removed.length === 1 && added.length === 1) {
      out.push({
        category: "treino",
        importance: "alta",
        label: `${removed[0]} foi substituído por ${added[0]}`,
        target_tab: "treino",
        target_anchor: anchorFor(added[0]),
        detail: `Antes: ${removed[0]} · Agora: ${added[0]}`,
      });
    } else {
      for (const nm of removed) {
        out.push({
          category: "treino",
          importance: "media",
          label: `${nm} foi removido do treino`,
          target_tab: "treino",
          target_anchor: null,
          detail: null,
        });
      }
      for (const nm of added) {
        const eNew = newEx.find((e) => s(e.name) === nm);
        const sets = s(eNew?.sets);
        const reps = s(eNew?.reps);
        const rest = s(eNew?.rest);
        let addedDetail: string | null = null;
        if (sets || reps) {
          addedDetail = `${sets || "?"}x${reps || "?"}`;
          if (rest) addedDetail += ` · descanso ${rest}`;
        }
        out.push({
          category: "treino",
          importance: "media",
          label: `Novo exercício adicionado: ${nm}`,
          target_tab: "treino",
          target_anchor: anchorFor(nm),
          detail: addedDetail,
        });
      }
    }

    // Ajustes em exercícios que continuam com o mesmo nome
    const common = oldNames.filter((nm) => newSet.has(nm));
    for (const nm of common) {
      const eOld = oldEx.find((e) => s(e.name) === nm);
      const eNew = newEx.find((e) => s(e.name) === nm);
      if (!eOld || !eNew) continue;

      const parts: string[] = [];
      const detailParts: string[] = [];
      if (s(eOld.sets) !== s(eNew.sets)) {
        parts.push("sets");
        detailParts.push(`Séries: ${s(eOld.sets) || "—"} → ${s(eNew.sets) || "—"}`);
      }
      if (s(eOld.reps) !== s(eNew.reps)) {
        parts.push("reps");
        detailParts.push(`Reps: ${s(eOld.reps) || "—"} → ${s(eNew.reps) || "—"}`);
      }
      if (s(eOld.rest) !== s(eNew.rest)) {
        parts.push("descanso");
        detailParts.push(`Descanso: ${s(eOld.rest) || "—"} → ${s(eNew.rest) || "—"}`);
      }
      if (s(eOld.cadence) !== s(eNew.cadence)) {
        parts.push("cadência");
        detailParts.push(`Cadência: ${s(eOld.cadence) || "—"} → ${s(eNew.cadence) || "—"}`);
      }
      if (parts.length > 0) {
        out.push({
          category: "treino",
          importance: "baixa",
          label: `${parts.join("/")} de ${nm} foi ajustado`,
          target_tab: "treino",
          target_anchor: anchorFor(nm),
          detail: detailParts.join(" · "),
        });
      }
      if (s(eOld.notes) !== s(eNew.notes)) {
        out.push({
          category: "treino",
          importance: "baixa",
          label: `Nova observação em ${nm}`,
          target_tab: "treino",
          target_anchor: anchorFor(nm),
          detail: s(eNew.notes) || null,
        });
      }
    }
  }

  // ─────────── MEALS (por meal.name) ───────────
  const pMeals: AnyRec[] = Array.isArray(prev.meals) ? prev.meals : [];
  const nMeals: AnyRec[] = Array.isArray(next.meals) ? next.meals : [];
  const pMealByName = new Map<string, AnyRec>();
  const nMealByName = new Map<string, AnyRec>();
  for (const m of pMeals) { const k = s(m.name); if (k) pMealByName.set(k, m); }
  for (const m of nMeals) { const k = s(m.name); if (k) nMealByName.set(k, m); }

  for (const [nm] of nMealByName) {
    if (!pMealByName.has(nm)) {
      out.push({
        category: "dieta",
        importance: "alta",
        label: `Uma nova refeição foi adicionada: ${nm}`,
        target_tab: "dieta",
        target_anchor: `meal-${slug(nm)}`,
        detail: null,
      });
    }
  }
  for (const [nm] of pMealByName) {
    if (!nMealByName.has(nm)) {
      out.push({
        category: "dieta",
        importance: "alta",
        label: `A refeição ${nm} foi removida do seu plano`,
        target_tab: "dieta",
        target_anchor: null,
        detail: null,
      });
    }
  }

  for (const [mealName, mOld] of pMealByName) {
    const mNew = nMealByName.get(mealName);
    if (!mNew) continue;

    if (s(mOld.time) !== s(mNew.time)) {
      out.push({
        category: "dieta",
        importance: "baixa",
        label: `O horário da refeição ${mealName} foi ajustado`,
        target_tab: "dieta",
        target_anchor: `meal-${slug(mealName)}`,
        detail: `Antes: ${s(mOld.time) || "—"} · Agora: ${s(mNew.time) || "—"}`,
      });
    }
    if (s(mOld.notes) !== s(mNew.notes)) {
      out.push({
        category: "dieta",
        importance: "baixa",
        label: `Nova observação na refeição ${mealName}`,
        target_tab: "dieta",
        target_anchor: `meal-${slug(mealName)}`,
        detail: s(mNew.notes) || null,
      });
    }

    // hiddenKinds: só gera quando um kind PASSA a ser ocultado
    const pHidden = new Set<string>(Array.isArray(mOld.hiddenKinds) ? mOld.hiddenKinds.map(String) : []);
    const nHidden = new Set<string>(Array.isArray(mNew.hiddenKinds) ? mNew.hiddenKinds.map(String) : []);
    let hiddenAdded = false;
    for (const k of nHidden) if (!pHidden.has(k)) hiddenAdded = true;
    if (hiddenAdded) {
      out.push({
        category: "dieta",
        importance: "media",
        label: `Uma opção da refeição ${mealName} deixou de estar disponível`,
        target_tab: "dieta",
        target_anchor: `meal-${slug(mealName)}`,
        detail: null,
      });
    }

    // options por (kind + title)
    const optKey = (o: AnyRec) => `${o.kind}::${s(o.title)}`;
    const pOpts = new Map<string, AnyRec>();
    const nOpts = new Map<string, AnyRec>();
    for (const o of (Array.isArray(mOld.options) ? mOld.options : [])) pOpts.set(optKey(o), o);
    for (const o of (Array.isArray(mNew.options) ? mNew.options : [])) nOpts.set(optKey(o), o);

    for (const [key, oOld] of pOpts) {
      const oNew = nOpts.get(key);
      if (!oNew) continue;
      const oldItems: AnyRec[] = Array.isArray(oOld.items) ? oOld.items : [];
      const newItems: AnyRec[] = Array.isArray(oNew.items) ? oNew.items : [];
      const oldNames = oldItems.map((it) => s(it.name)).filter(Boolean);
      const newNames = newItems.map((it) => s(it.name)).filter(Boolean);
      const oldSet = new Set(oldNames);
      const newSet = new Set(newNames);
      const anchorBase = `meal-${slug(mealName)}-${oOld.kind}-${slug(oOld.title || "")}`;

      for (const it of newNames) {
        if (!oldSet.has(it)) {
          const added = newItems.find((x) => s(x.name) === it);
          out.push({
            category: "dieta",
            importance: "media",
            label: `${it} foi adicionado na refeição ${mealName}`,
            target_tab: "dieta",
            target_anchor: `${anchorBase}-item-${slug(it)}`,
            detail: s(added?.weight) || null,
          });
        }
      }
      for (const it of oldNames) {
        if (!newSet.has(it)) {
          out.push({
            category: "dieta",
            importance: "media",
            label: `${it} foi removido da refeição ${mealName}`,
            target_tab: "dieta",
            target_anchor: null,
            detail: null,
          });
        }
      }
      const common = oldNames.filter((nm) => newSet.has(nm));
      for (const nm of common) {
        const iOld = oldItems.find((it) => s(it.name) === nm);
        const iNew = newItems.find((it) => s(it.name) === nm);
        if (s(iOld?.weight) !== s(iNew?.weight)) {
          out.push({
            category: "dieta",
            importance: "baixa",
            label: `A quantidade de ${nm} na refeição ${mealName} foi ajustada`,
            target_tab: "dieta",
            target_anchor: `${anchorBase}-item-${slug(nm)}`,
            detail: `Antes: ${s(iOld?.weight) || "—"} · Agora: ${s(iNew?.weight) || "—"}`,
          });
        }
      }
    }
  }

  // ─────────── SUPLEMENTOS (por name) ───────────
  const pSup: AnyRec[] = Array.isArray(prev.supplements) ? prev.supplements : [];
  const nSup: AnyRec[] = Array.isArray(next.supplements) ? next.supplements : [];
  const pSupByName = new Map<string, AnyRec>();
  const nSupByName = new Map<string, AnyRec>();
  for (const it of pSup) { const k = s(it.name); if (k) pSupByName.set(k, it); }
  for (const it of nSup) { const k = s(it.name); if (k) nSupByName.set(k, it); }

  for (const [nm, sNew] of nSupByName) {
    if (!pSupByName.has(nm)) {
      const dose = s(sNew.dose);
      const timing = s(sNew.timing);
      let addedDetail: string | null = null;
      if (dose) {
        addedDetail = dose;
        if (timing) addedDetail += ` · ${timing}`;
      } else if (timing) {
        addedDetail = timing;
      }
      out.push({
        category: "suplemento",
        importance: "alta",
        label: `Novo suplemento adicionado: ${nm}`,
        target_tab: "suplementos",
        target_anchor: `supplement-${slug(nm)}`,
        detail: addedDetail,
      });
    }
  }
  for (const [nm] of pSupByName) {
    if (!nSupByName.has(nm)) {
      out.push({
        category: "suplemento",
        importance: "media",
        label: `${nm} foi removido dos suplementos`,
        target_tab: "suplementos",
        target_anchor: null,
        detail: null,
      });
    }
  }
  for (const [nm, sOld] of pSupByName) {
    const sNew = nSupByName.get(nm);
    if (!sNew) continue;
    const doseChanged = s(sOld.dose) !== s(sNew.dose);
    const timingChanged = s(sOld.timing) !== s(sNew.timing);
    const notesChanged = s(sOld.notes) !== s(sNew.notes);
    if (doseChanged || timingChanged || notesChanged) {
      const parts: string[] = [];
      if (doseChanged) parts.push(`Dose: ${s(sOld.dose) || "—"} → ${s(sNew.dose) || "—"}`);
      if (timingChanged) parts.push(`Horário: ${s(sOld.timing) || "—"} → ${s(sNew.timing) || "—"}`);
      if (notesChanged && s(sNew.notes)) parts.push(s(sNew.notes));
      out.push({
        category: "suplemento",
        importance: "baixa",
        label: `${nm} teve dose ou horário ajustado`,
        target_tab: "suplementos",
        target_anchor: `supplement-${slug(nm)}`,
        detail: parts.length > 0 ? parts.join(" · ") : null,
      });
    }
  }

  return out;
}

/**
 * Aplica os dois casos especiais que não pertencem ao comparador puro:
 *
 * - `wasInactive: true` → o protocolo estava desativado e acabou de ser
 *   liberado; o aluno recebe um único evento "geral" e não a lista de
 *   diffs, porque para ele é a primeira versão que existe.
 * - Caso contrário, se o diff produziu **mais de 20** itens, colapsa em um
 *   único evento "geral" (mudou tanto que listar cada item vira ruído).
 * - Caso contrário devolve o array recebido, sem tocar.
 */
export function summarizeProtocolChanges(args: {
  wasInactive: boolean;
  changes: ProtocolChange[];
}): ProtocolChange[] {
  if (args.wasInactive) {
    return [{
      category: "geral",
      importance: "alta",
      label: "Seu protocolo foi liberado pelo seu coach",
      target_tab: null,
      target_anchor: null,
      detail: null,
    }];
  }
  if (args.changes.length > 20) {
    return [{
      category: "geral",
      importance: "alta",
      label: "Seu protocolo foi totalmente atualizado pelo seu coach",
      target_tab: null,
      target_anchor: null,
      detail: null,
    }];
  }
  return args.changes;
}
