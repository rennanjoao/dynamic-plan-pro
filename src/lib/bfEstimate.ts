/**
 * bfEstimate.ts
 * Estimativa de %BF (US Navy) compartilhada por todo o app.
 *
 * NUNCA aceita valor digitado: BF% é sempre derivado das medidas reais
 * (altura, pescoço, cintura — e quadril para feminino).
 */

export interface BFInput {
  altura?: number | string | null;
  cintura?: number | string | null;
  pescoco?: number | string | null;
  quadril?: number | string | null;
  genero?: string | null;
}

export interface BFResult {
  value: number | null;
  missing: string[];
}

function num(v: unknown): number {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."));
    return isFinite(n) ? n : NaN;
  }
  return NaN;
}

export function estimateBF(input: BFInput): BFResult {
  const altura = num(input.altura);
  const cintura = num(input.cintura);
  const pescoco = num(input.pescoco);
  const quadril = num(input.quadril);
  const isF = (input.genero || "").toUpperCase().startsWith("F");

  const missing: string[] = [];
  if (!(altura > 100)) missing.push("altura");
  if (!(cintura > 40)) missing.push("cintura");
  if (!(pescoco > 20)) missing.push("pescoço");
  if (isF && !(quadril > 60)) missing.push("quadril");

  if (missing.length > 0) return { value: null, missing };

  let bf: number;
  if (isF) {
    const inner = cintura + quadril - pescoco;
    if (inner <= 0) return { value: null, missing: ["medidas inconsistentes"] };
    bf = 495 / (1.29579 - 0.35004 * Math.log10(inner) + 0.221 * Math.log10(altura)) - 450;
  } else {
    const inner = cintura - pescoco;
    if (inner <= 0) return { value: null, missing: ["medidas inconsistentes"] };
    bf = 495 / (1.0324 - 0.19077 * Math.log10(inner) + 0.15456 * Math.log10(altura)) - 450;
  }

  if (!isFinite(bf)) return { value: null, missing: ["medidas inconsistentes"] };
  bf = Math.min(60, Math.max(isF ? 10 : 2, bf));
  return { value: Math.round(bf * 10) / 10, missing: [] };
}