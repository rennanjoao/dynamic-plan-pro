/**
 * protocolDiff.ts
 *
 * Compara o payload de um protocolo ANTES x DEPOIS de uma edição do coach e
 * produz uma lista de eventos (`ProtocolChange[]`) já com mensagens em
 * português prontas para exibir para o aluno. É consumido pelo save() do
 * `ProtocolBuilder` para popular `protocol_change_events.changes`.
 *
 * Regras completas: ver docstring de `buildProtocolChanges` e a spec da tela
 * do aluno.
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
}

const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

type AnyRec = Record<string, any>;

/**
 * Compara dois payloads de protocolo e retorna a lista de mudanças
 * relevantes para o aluno. Não aplica os cortes de "primeira ativação" nem
 * o teto de >8 itens — quem chama decide o que fazer com a lista bruta.
 */
export function buildProtocolChanges(prev: AnyRec | null | undefined, next: AnyRec | null | undefined): ProtocolChange[] {
  const out: ProtocolChange[] = [];
  if (!prev || !next) return out;

  // ─────────── MACROS ───────────
  const pm: AnyRec = prev.macros ?? {};
  const nm: AnyRec = next.macros ?? {};
  const macroFields = ["calories", "protein", "carbs", "fat", "water"] as const;
  const macrosChanged = macroFields.some((k) => n(pm[k]) !== n(nm[k]));
  if (macrosChanged) {
    out.push({
      category: "dieta",
      importance: "media",
      label: "Suas metas de calorias e macros foram ajustadas",
      target_tab: "dieta",
      target_anchor: null,
    });
  }
  if (s(pm.goal) !== s(nm.goal)) {
    out.push({
      category: "dieta",
      importance: "media",
      label: "Seu objetivo foi atualizado",
      target_tab: "dieta",
      target_anchor: null,
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
    });
  } else if (pTraining !== nTraining) {
    out.push({
      category: "diretriz",
      importance: "baixa",
      label: "A diretriz de treino foi atualizada",
      target_tab: "treino",
      target_anchor: "guideline-training",
    });
  }

  // ─────────── WORKOUTS (por day.key) ───────────
  const pw: AnyRec[] = Array.isArray(prev.workouts) ? prev.workouts : [];
  const nw: AnyRec[] = Array.isArray(next.workouts) ? next.workouts : [];
  const pDays = new Map<string, AnyRec>(pw.map((d) => [String(d.key), d]));
  const nDays = new Map<string, AnyRec>(nw.map((d) => [String(d.key), d]));

  for (const [key, day] of nDays) {
    if (!pDays.has(key)) {
      out.push({
        category: "treino",
        importance: "alta",
        label: `Um novo dia de treino foi adicionado: ${s(day.focus) || key}`,
        target_tab: "treino",
        target_anchor: null,
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
      });
    } else {
      for (const nm of removed) {
        out.push({
          category: "treino",
          importance: "media",
          label: `${nm} foi removido do treino`,
          target_tab: "treino",
          target_anchor: null,
        });
      }
      for (const nm of added) {
        out.push({
          category: "treino",
          importance: "media",
          label: `Novo exercício adicionado: ${nm}`,
          target_tab: "treino",
          target_anchor: anchorFor(nm),
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
      if (s(eOld.sets) !== s(eNew.sets)) parts.push("sets");
      if (s(eOld.reps) !== s(eNew.reps)) parts.push("reps");
      if (s(eOld.rest) !== s(eNew.rest)) parts.push("descanso");
      if (s(eOld.cadence) !== s(eNew.cadence)) parts.push("cadência");
      if (parts.length > 0) {
        out.push({
          category: "treino",
          importance: "baixa",
          label: `${parts.join("/")} de ${nm} foi ajustado`,
          target_tab: "treino",
          target_anchor: anchorFor(nm),
        });
      }
      if (s(eOld.notes) !== s(eNew.notes)) {
        out.push({
          category: "treino",
          importance: "baixa",
          label: `Nova observação em ${nm}`,
          target_tab: "treino",
          target_anchor: anchorFor(nm),
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

  for (const [nm, meal] of nMealByName) {
    if (!pMealByName.has(nm)) {
      out.push({
        category: "dieta",
        importance: "alta",
        label: `Uma nova refeição foi adicionada: ${nm}`,
        target_tab: "dieta",
        target_anchor: `meal-${slug(nm)}`,
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
      });
    }
    if (s(mOld.notes) !== s(mNew.notes)) {
      out.push({
        category: "dieta",
        importance: "baixa",
        label: `Nova observação na refeição ${mealName}`,
        target_tab: "dieta",
        target_anchor: `meal-${slug(mealName)}`,
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
          out.push({
            category: "dieta",
            importance: "media",
            label: `${it} foi adicionado na refeição ${mealName}`,
            target_tab: "dieta",
            target_anchor: `${anchorBase}-item-${slug(it)}`,
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

  for (const [nm] of nSupByName) {
    if (!pSupByName.has(nm)) {
      out.push({
        category: "suplemento",
        importance: "alta",
        label: `Novo suplemento adicionado: ${nm}`,
        target_tab: "suplementos",
        target_anchor: `supplement-${slug(nm)}`,
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
      });
    }
  }
  for (const [nm, sOld] of pSupByName) {
    const sNew = nSupByName.get(nm);
    if (!sNew) continue;
    if (
      s(sOld.dose) !== s(sNew.dose) ||
      s(sOld.timing) !== s(sNew.timing) ||
      s(sOld.notes) !== s(sNew.notes)
    ) {
      out.push({
        category: "suplemento",
        importance: "baixa",
        label: `${nm} teve dose ou horário ajustado`,
        target_tab: "suplementos",
        target_anchor: `supplement-${slug(nm)}`,
      });
    }
  }

  return out;
}