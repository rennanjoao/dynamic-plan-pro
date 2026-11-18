/**
 * checkinDraft.ts — rascunho automático do check-in no aparelho do aluno.
 *
 * Por quê: o check-in tem dezenas de perguntas + fotos. Ao trocar de app para
 * tirar foto ou atender uma ligação, o celular (principalmente iPhone) pode
 * recarregar a página — antes disso tudo se perdia.
 *
 * O que é salvo:
 *  - respostas, medidas e etapa → localStorage (pequeno, síncrono);
 *  - fotos escolhidas → IndexedDB (aguenta arquivos grandes).
 * PDFs de exame não são guardados (raros e pesados) — o aluno anexa de novo.
 *
 * Tudo é best-effort: se o navegador bloquear armazenamento, o check-in
 * continua funcionando como antes, só sem rascunho.
 */

export type CheckinDraftMode = "new" | "update";

export interface CheckinDraft {
  data: Record<string, unknown>;
  metrics: Record<string, string>;
  step: 1 | 2 | 3;
  savedAt: number;
}

/** Rascunhos mais velhos que isso são descartados (um ciclo de check-in). */
export const CHECKIN_DRAFT_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const PREFIX = "checkin_draft_v1_";

export function checkinDraftKey(studentId: string, mode: CheckinDraftMode, baseCheckinId?: string | null): string {
  return mode === "update"
    ? `${PREFIX}${studentId}_update_${baseCheckinId ?? "none"}`
    : `${PREFIX}${studentId}_new`;
}

/** True quando há algo que valha recuperar. */
export function draftHasContent(d: Pick<CheckinDraft, "data" | "metrics"> | null | undefined): boolean {
  if (!d) return false;
  const filled = (v: unknown) =>
    v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "") &&
    !(Array.isArray(v) && v.length === 0);
  const dataFilled = Object.values(d.data ?? {}).some(filled);
  // Medidas iniciais (ini_*) vêm da anamnese automaticamente — não contam.
  const metricsFilled = Object.entries(d.metrics ?? {}).some(([k, v]) => !k.startsWith("ini_") && filled(v));
  return dataFilled || metricsFilled;
}

export function saveCheckinDraft(key: string, draft: Omit<CheckinDraft, "savedAt">, now = Date.now()): void {
  try {
    if (!draftHasContent(draft)) { localStorage.removeItem(key); return; }
    localStorage.setItem(key, JSON.stringify({ ...draft, savedAt: now }));
  } catch { /* quota cheia / modo privado */ }
}

export function loadCheckinDraft(key: string, now = Date.now()): CheckinDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CheckinDraft>;
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.savedAt !== "number" || now - parsed.savedAt > CHECKIN_DRAFT_MAX_AGE_MS) {
      localStorage.removeItem(key);
      return null;
    }
    const step = parsed.step === 2 || parsed.step === 3 ? parsed.step : 1;
    const draft: CheckinDraft = {
      data: (parsed.data && typeof parsed.data === "object") ? parsed.data as Record<string, unknown> : {},
      metrics: (parsed.metrics && typeof parsed.metrics === "object") ? parsed.metrics as Record<string, string> : {},
      step,
      savedAt: parsed.savedAt,
    };
    return draftHasContent(draft) ? draft : null;
  } catch {
    return null;
  }
}

/** Remove todos os rascunhos (texto) deste aluno. As fotos são limpas à parte. */
export function clearCheckinDrafts(studentId: string): void {
  try {
    const prefix = `${PREFIX}${studentId}_`;
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(prefix)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* noop */ }
}

// ─── Fotos (IndexedDB) ──────────────────────────────────────────────────────

const DB_NAME = "elite-checkin-drafts";
const STORE = "photos";

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

type StoredPhoto = { blob: Blob; name: string; type: string; savedAt: number };

async function withStore<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      let result: T | null = null;
      if (req) req.onsuccess = () => { result = req.result; };
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); resolve(null); };
      tx.onabort = () => { db.close(); resolve(null); };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function saveDraftPhoto(draftKey: string, fotoKey: string, file: File): Promise<void> {
  const value: StoredPhoto = { blob: file, name: file.name, type: file.type, savedAt: Date.now() };
  await withStore("readwrite", (s) => s.put(value, `${draftKey}:${fotoKey}`));
}

export async function removeDraftPhoto(draftKey: string, fotoKey: string): Promise<void> {
  await withStore("readwrite", (s) => s.delete(`${draftKey}:${fotoKey}`));
}

export async function loadDraftPhotos(draftKey: string, fotoKeys: readonly string[]): Promise<Record<string, File>> {
  const out: Record<string, File> = {};
  for (const k of fotoKeys) {
    const v = await withStore<StoredPhoto | undefined>("readonly", (s) => s.get(`${draftKey}:${k}`));
    if (v && v.blob && Date.now() - (v.savedAt ?? 0) <= CHECKIN_DRAFT_MAX_AGE_MS) {
      out[k] = new File([v.blob], v.name || `${k}.jpg`, { type: v.type || v.blob.type || "image/jpeg" });
    }
  }
  return out;
}

export async function clearDraftPhotos(draftKey: string, fotoKeys: readonly string[]): Promise<void> {
  for (const k of fotoKeys) await removeDraftPhoto(draftKey, k);
}
