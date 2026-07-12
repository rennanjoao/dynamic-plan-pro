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
// Chave de identidade insensível a caixa/acentos-livres — usada para decidir
// "isto é o mesmo item" ao comparar exercícios, refeições, itens e suplementos.
// O texto exibido continua vindo de s(item.name) preservando a caixa original.
const nameKey = (v: unknown): string => s(v).toLowerCase();

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
    // Identidade case-insensitive; display preserva a caixa do coach.
    const oldByKey = new Map<string, string>();
    const newByKey = new Map<string, string>();
    for (const e of oldEx) { const nm = s(e.name); if (nm) oldByKey.set(nameKey(nm), nm); }
    for (const e of newEx) { const nm = s(e.name); if (nm) newByKey.set(nameKey(nm), nm); }

    const removedKeys = new Set<string>();
    for (const k of oldByKey.keys()) if (!newByKey.has(k)) removedKeys.add(k);
    const addedKeys = new Set<string>();
    for (const k of newByKey.keys()) if (!oldByKey.has(k)) addedKeys.add(k);

    const anchorFor = (nm: string) => `workout-${key}-exercise-${slug(nm)}`;

    // Pareamento por posição: se old[i] foi removido e new[i] foi adicionado
    // e ambas as chaves são distintas, tratamos como substituição naquela
    // posição. Isso cobre o caso de reformulação de um dia inteiro.
    const pairedRemoved = new Set<string>();
    const pairedAdded = new Set<string>();
    const maxLen = Math.max(oldEx.length, newEx.length);
    for (let i = 0; i < maxLen; i++) {
      const oldName = s(oldEx[i]?.name);
      const newName = s(newEx[i]?.name);
      if (!oldName || !newName) continue;
      const oldK = nameKey(oldName);
      const newK = nameKey(newName);
      if (oldK === newK) continue;
      if (!removedKeys.has(oldK) || !addedKeys.has(newK)) continue;
      if (pairedRemoved.has(oldK) || pairedAdded.has(newK)) continue;
      pairedRemoved.add(oldK);
      pairedAdded.add(newK);
      out.push({
        category: "treino",
        importance: "alta",
        label: `${oldName} foi substituído por ${newName}`,
        target_tab: "treino",
        target_anchor: anchorFor(newName),
        detail: `Antes: ${oldName} · Agora: ${newName}`,
      });
    }

    for (const k of removedKeys) {
      if (pairedRemoved.has(k)) continue;
      const nm = oldByKey.get(k)!;
      out.push({
        category: "treino",
        importance: "media",
        label: `${nm} foi removido do treino`,
        target_tab: "treino",
        target_anchor: null,
        detail: null,
      });
    }
    for (const k of addedKeys) {
      if (pairedAdded.has(k)) continue;
      const nm = newByKey.get(k)!;
      const eNew = newEx.find((e) => nameKey(e.name) === k);
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

    // Ajustes em exercícios que continuam com a mesma chave nos dois lados
    for (const [k, nm] of oldByKey) {
      if (!newByKey.has(k)) continue;
      const eOld = oldEx.find((e) => nameKey(e.name) === k);
      const eNew = newEx.find((e) => nameKey(e.name) === k);
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
  // Identidade case-insensitive; display preserva a caixa do coach.
  const pMealByName = new Map<string, { display: string; meal: AnyRec }>();
  const nMealByName = new Map<string, { display: string; meal: AnyRec }>();
  for (const m of pMeals) { const d = s(m.name); const k = nameKey(m.name); if (k) pMealByName.set(k, { display: d, meal: m }); }
  for (const m of nMeals) { const d = s(m.name); const k = nameKey(m.name); if (k) nMealByName.set(k, { display: d, meal: m }); }

  for (const [k, { display: nm }] of nMealByName) {
    if (!pMealByName.has(k)) {
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
  for (const [k, { display: nm }] of pMealByName) {
    if (!nMealByName.has(k)) {
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

  for (const [mk, { display: mealName, meal: mOld }] of pMealByName) {
    const nEntry = nMealByName.get(mk);
    if (!nEntry) continue;
    const mNew = nEntry.meal;

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
      const oldByKey = new Map<string, string>();
      const newByKey = new Map<string, string>();
      for (const it of oldItems) { const d = s(it.name); if (d) oldByKey.set(nameKey(d), d); }
      for (const it of newItems) { const d = s(it.name); if (d) newByKey.set(nameKey(d), d); }
      const removedKeys = new Set<string>();
      for (const k of oldByKey.keys()) if (!newByKey.has(k)) removedKeys.add(k);
      const addedKeys = new Set<string>();
      for (const k of newByKey.keys()) if (!oldByKey.has(k)) addedKeys.add(k);
      const anchorBase = `meal-${slug(mealName)}-${oOld.kind}-${slug(oOld.title || "")}`;

      // Pareamento por posição — reformular uma opção inteira gera
      // "substituição" em vez de linhas soltas de add/remove.
      const pairedRemoved = new Set<string>();
      const pairedAdded = new Set<string>();
      const maxLen = Math.max(oldItems.length, newItems.length);
      for (let i = 0; i < maxLen; i++) {
        const oldName = s(oldItems[i]?.name);
        const newName = s(newItems[i]?.name);
        if (!oldName || !newName) continue;
        const oldK = nameKey(oldName);
        const newK = nameKey(newName);
        if (oldK === newK) continue;
        if (!removedKeys.has(oldK) || !addedKeys.has(newK)) continue;
        if (pairedRemoved.has(oldK) || pairedAdded.has(newK)) continue;
        pairedRemoved.add(oldK);
        pairedAdded.add(newK);
        out.push({
          category: "dieta",
          importance: "media",
          label: `${oldName} foi substituído por ${newName} na refeição ${mealName}`,
          target_tab: "dieta",
          target_anchor: `${anchorBase}-item-${slug(newName)}`,
          detail: `Antes: ${oldName} · Agora: ${newName}`,
        });
      }

      for (const k of addedKeys) {
        if (pairedAdded.has(k)) continue;
        const it = newByKey.get(k)!;
        const added = newItems.find((x) => nameKey(x.name) === k);
        out.push({
          category: "dieta",
          importance: "media",
          label: `${it} foi adicionado na refeição ${mealName}`,
          target_tab: "dieta",
          target_anchor: `${anchorBase}-item-${slug(it)}`,
          detail: s(added?.weight) || null,
        });
      }
      for (const k of removedKeys) {
        if (pairedRemoved.has(k)) continue;
        const it = oldByKey.get(k)!;
        out.push({
          category: "dieta",
          importance: "media",
          label: `${it} foi removido da refeição ${mealName}`,
          target_tab: "dieta",
          target_anchor: null,
          detail: null,
        });
      }
      for (const [k, nm] of oldByKey) {
        if (!newByKey.has(k)) continue;
        const iOld = oldItems.find((it) => nameKey(it.name) === k);
        const iNew = newItems.find((it) => nameKey(it.name) === k);
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
  const pSupByName = new Map<string, { display: string; item: AnyRec }>();
  const nSupByName = new Map<string, { display: string; item: AnyRec }>();
  for (const it of pSup) { const d = s(it.name); const k = nameKey(it.name); if (k) pSupByName.set(k, { display: d, item: it }); }
  for (const it of nSup) { const d = s(it.name); const k = nameKey(it.name); if (k) nSupByName.set(k, { display: d, item: it }); }

  for (const [k, { display: nm, item: sNew }] of nSupByName) {
    if (!pSupByName.has(k)) {
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
  for (const [k, { display: nm }] of pSupByName) {
    if (!nSupByName.has(k)) {
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
  for (const [k, { display: nm, item: sOld }] of pSupByName) {
    const nEntry = nSupByName.get(k);
    if (!nEntry) continue;
    const sNew = nEntry.item;
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
