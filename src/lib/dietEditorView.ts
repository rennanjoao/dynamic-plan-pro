// src/lib/dietEditorView.ts
//
// Regras de EXIBIÇÃO da aba Dieta do coach ("Dieta enxuta", auditoria de
// 21/11/2026). Nada aqui altera o payload: só decide o que aparece na tela.
//  - Opção vazia (Op 2/3 sem nada) some e vira o botão "+ Opção N".
//  - Título padrão ("Opção 1") não é repetido ao lado do selo "Op 1".
//  - Refeição fechada vira uma linha: nome · horário · alimentos da Opção 1.

type Kind = "carb" | "protein" | "fat";
const KINDS: Kind[] = ["carb", "protein", "fat"];

const text = (v: unknown) => String(v ?? "").trim();

/** Título que o próprio sistema gera ("Opção 1", "Opcao 2") ou vazio. */
export function isDefaultOptionTitle(title: unknown): boolean {
  const t = text(title);
  return t === "" || /^op[çc][ãa]o\s*\d+$/i.test(t);
}

/**
 * Opção sem nada digitado pelo coach: nenhum alimento com nome, quantidade ou
 * substituição, sem observação e com título padrão. É o que o "Gerar Base"
 * antigo criava como Opção 2 — o aluno já não via essas opções.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isBlankOption(opt: any): boolean {
  if (!opt || typeof opt !== "object") return true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = Array.isArray(opt.items) ? opt.items : [];
  const hasContent = items.some(
    (it) =>
      text(it?.baseName) || text(it?.name) || text(it?.weight) ||
      text(it?.substitution?.baseName) || text(it?.substitution?.name),
  );
  return !hasContent && !text(opt.notes) && isDefaultOptionTitle(opt.title);
}

/**
 * Índices (dentro do grupo) das opções que aparecem na tela: a Opção 1
 * sempre; as demais quando têm conteúdo ou quando o coach pediu "+ Opção".
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function visibleOptionIndexes(opts: any[], isRevealed: (optIdx: number) => boolean): number[] {
  const out: number[] = [];
  opts.forEach((o, i) => {
    if (i === 0 || !isBlankOption(o) || isRevealed(i)) out.push(i);
  });
  return out;
}

/**
 * Alimentos da Opção 1 de cada grupo visível, na ordem carbo → proteína →
 * gordura, com a quantidade como o coach digitou. Usado na linha-resumo da
 * refeição fechada.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mealFoodsPreview(meal: any): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = Array.isArray(meal?.options) ? meal.options : [];
  const hidden: string[] = Array.isArray(meal?.hiddenKinds) ? meal.hiddenKinds : [];
  const out: string[] = [];
  for (const kind of KINDS) {
    if (hidden.includes(kind)) continue;
    const first = all.find((o) => o?.kind === kind);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = Array.isArray(first?.items) ? first.items : [];
    for (const it of items) {
      const name = text(it?.baseName) || text(it?.name);
      if (!name) continue;
      const qty = text(it?.weight);
      out.push(qty ? `${name} ${qty}` : name);
    }
  }
  return out;
}
