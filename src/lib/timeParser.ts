// src/lib/timeParser.ts

/**
 * Extrai os tempos de descanso em segundos a partir de um texto livre.
 *
 * Regras implementadas:
 * - "60" -> [60]
 * - "1 min" -> [60]
 * - "60 a 90" -> [60, 90]
 * - "1 a 2 min" -> [60, 120] (A IA infere que o primeiro número também é minuto)
 * - "1.5 min" -> [90]
 */
export function parseRestTime(restStr: string | null | undefined): number[] {
  if (!restStr) return [];

  // Normaliza a string: minúsculas, troca vírgula por ponto (para lidar com decimais como 1,5)
  const str = restStr.toLowerCase().replace(/,/g, '.');

  // Regex para capturar números (inteiros ou decimais) e opcionalmente sua unidade logo após
  const regex = /(\d+(?:\.\d+)?)\s*(min|m|seg|s)?/g;
  const matches = [...str.matchAll(regex)];

  if (matches.length === 0) return [];

  // Verifica se a última unidade informada é "minuto"
  // Isso resolve o problema do "1 a 2 min", aplicando a regra de minuto ao "1"
  let hasGlobalMin = false;
  const lastUnit = matches[matches.length - 1][2];
  if (lastUnit === 'min' || lastUnit === 'm') {
    hasGlobalMin = true;
  }

  const parsed = matches.map((match, index) => {
    const val = parseFloat(match[1]);
    let unit = match[2];

    // Se o número atual não tem unidade, mas o texto finaliza com "min", ele herda a unidade
    if (!unit && hasGlobalMin && index < matches.length - 1) {
      unit = 'min';
    }

    // Conversão para segundos
    if (unit === 'min' || unit === 'm') {
      return Math.round(val * 60);
    }

    // Assume segundos por padrão
    return Math.round(val);
  });

  // Retorna no máximo os 2 primeiros números (o min e o max), ordenados do menor para o maior
  return parsed.slice(0, 2).sort((a, b) => a - b);
}
