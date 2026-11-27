/**
 * age.ts — idade a partir da data de nascimento digitada na anamnese.
 * Aceita "AAAA-MM-DD" (campo de data do formulário) e "DD/MM/AAAA" (fichas antigas).
 */

/** Data de nascimento válida (meia-noite local) ou null. */
export function parseBirthDate(value: unknown): Date | null {
  const s = String(value ?? "").trim();
  let y: number, m: number, d: number;
  let mm = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (mm) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
  else if ((mm = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s))) { d = +mm[1]; m = +mm[2]; y = +mm[3]; }
  else return null;
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** Idade em anos completos na data `now`, ou null se a data não for válida ou estiver no futuro. */
export function ageFromBirthDate(value: unknown, now: Date = new Date()): number | null {
  const b = parseBirthDate(value);
  if (!b || b > now) return null;
  let age = now.getFullYear() - b.getFullYear();
  const beforeBirthday = now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 && age < 130 ? age : null;
}

/** "10/05/1970" a partir do valor salvo; devolve o texto original se não der para ler. */
export function formatBirthDate(value: unknown): string {
  const b = parseBirthDate(value);
  if (!b) return String(value ?? "");
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(b.getDate())}/${p(b.getMonth() + 1)}/${b.getFullYear()}`;
}

/** Menor de 18 anos na data `now` (false quando a data não é válida). */
export function isMinor(value: unknown, now: Date = new Date()): boolean {
  const a = ageFromBirthDate(value, now);
  return a !== null && a < 18;
}
