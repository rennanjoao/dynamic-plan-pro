/**
 * householdMeasures.ts — medidas caseiras dos alimentos (peso em gramas de cada medida).
 *
 * FONTE: IBGE, Pesquisa de Orçamentos Familiares 2008-2009 — "Tabela de Medidas Referidas para os
 * Alimentos Consumidos no Brasil" (2011). Cada medida guarda a referência que o IBGE citou
 * (Pinheiro et al. 2004 na maioria) e, em `ref`, o código do alimento no IBGE + a descrição da
 * linha da tabela, para qualquer número poder ser conferido. Copo e xícara de leite e suco:
 * ANVISA IN 75/2020, Anexo VII (copo e xícara de chá = 200 ml), convertidos pela densidade
 * (foodDensity.ts).
 *
 * REGRAS (Rennan, 25/11/2026 — lista revisada linha a linha contra a planilha original do IBGE):
 *  - Alimento CRU só recebe medida de cru. Medida de alimento pronto (colher de servir, concha,
 *    escumadeira, filé, posta…) vai no item cozido, grelhado ou assado.
 *  - Só entra medida cuja descrição no IBGE é do mesmo alimento — ou a medida geral que o próprio
 *    IBGE usa para o grupo ("carne bovina", "peixe", "feijão branco", "óleo vegetal") — e de
 *    tamanho médio. "cheia"/"rasa" no rótulo segue a descrição da fonte.
 *  - Nada de peso inventado: alimento sem medida confiável fica só com gramas.
 *  - "1 unidade" desta lista passa a ser também o peso da unidade (unitWeight) do alimento.
 *  - Pares de nomes (foodTwins.ts) compartilham medidas e peso da unidade.
 *  - O aluno continua vendo gramas; a medida aparece só com "Mostrar medidas caseiras ao aluno".
 *
 * chave = nome EXATO do alimento no catálogo (tacoFoods / enrichedFoods / industrialFoods).
 */
import type { TacoFood } from "./tacoFoods";
import { ENRICHED_TO_LEGACY } from "./foodTwins";

export interface HouseholdMeasure {
  label: string;
  grams: number;
  /** De onde veio o peso. */
  source: string;
  /** Linha da tabela do IBGE: código do alimento + descrição da referência. */
  ref?: string;
}

const P = "IBGE POF 2008-2009 (Pinheiro et al., 2004)";
const GUIA = "IBGE POF 2008-2009 (Guia Alimentar para a População Brasileira, 2006)";
const PHI = "IBGE POF 2008-2009 (Philippi, 2008)";
const TOM = "IBGE POF 2008-2009 (Tomita & Cardoso, 2000)";
const PAC = "IBGE POF 2008-2009 (Pacheco, 2006)";
const UNI = "IBGE POF 2008-2009 (itens pesados em universidades brasileiras)";
const ANVISA = "ANVISA IN 75/2020, Anexo VII (200 ml) × densidade";
const CADASTRO = "peso já cadastrado no app";

const m = (label: string, grams: number, source: string, ref?: string): HouseholdMeasure => ({ label, grams, source, ref });

export const HOUSEHOLD_MEASURES: Record<string, HouseholdMeasure[]> = {
  // ── Carboidratos ──
  "Farinha, de mandioca, torrada": [
    m("1 colher de sopa cheia", 16, P, "6501401 Farinha de mandioca - colher de sopa cheia"),
    m("1 colher de servir", 33, UNI, "6501401 Farinha de mandioca - colher de arroz"),
    m("1 concha", 110, UNI, "6501401 Farinha de mandioca - concha"),
    m("1 xícara (chá)", 148, UNI, "6501401 Farinha de mandioca - xícara de chá"),
    m("1 punhado", 23, UNI, "6501401 Farinha de mandioca - punhado"),
    m("1 colher de sobremesa cheia", 10, P, "6501401 Farinha de mandioca - colher de sobremesa cheia"),
    m("1 colher de chá cheia", 5, P, "6501401 Farinha de mandioca - colher de chá cheia"),
  ],
  "Farinha, de milho, amarela": [
    m("1 colher de sopa", 12, GUIA, "6500603 Farinha de milho - colher de sopa"),
    m("1 colher de sobremesa", 6, GUIA, "6500603 Farinha de milho - 1/2 colher de sopa"),
    m("1 colher de chá", 3, GUIA, "6500603 Farinha de milho - 1/4 colher de sopa"),
  ],
  "Milho, verde, enlatado, drenado": [
    m("1 colher de sopa", 24, P, "7700401 Milho verde enlatado - colher de sopa"),
    m("1 colher de sobremesa cheia", 17, P, "7700401 Milho-verde enlatado - colher de sobremesa cheia"),
  ],
  "Pipoca, com óleo de soja, sem sal": [
    m("1 colher de servir", 3, UNI, "8501202 Pipoca - colher de arroz"),
    m("1 concha", 6, UNI, "8501202 Pipoca - concha"),
    m("1 xícara (chá)", 6, UNI, "8501202 Pipoca - xícara de chá"),
    m("1 punhado", 2, UNI, "8501202 Pipoca - punhado"),
  ],
  "Arroz branco (cozido)": [
    m("1 colher de sopa cheia", 25, P, "6300101 Arroz cozido - colher de sopa cheia"),
    m("1 colher de servir cheia", 45, P, "6300101 Arroz cozido - colher de arroz cheia"),
    m("1 concha cheia", 100, P, "6300101 Arroz cozido - concha média cheia"),
    m("1 escumadeira cheia", 85, P, "6300101 Arroz cozido - escumadeira média cheia"),
    m("1 colher de sobremesa cheia", 12.5, P, "6300101 Arroz cozido - 1/2 colher de sopa cheia"),
    m("1 colher de chá cheia", 6.3, P, "6300101 Arroz cozido - 1/4 colher de sopa cheia"),
  ],
  "Arroz parboilizado (cozido)": [
    m("1 colher de sopa cheia", 25, P, "6300101 Arroz cozido - colher de sopa cheia"),
    m("1 colher de servir cheia", 45, P, "6300101 Arroz cozido - colher de arroz cheia"),
    m("1 concha cheia", 100, P, "6300101 Arroz cozido - concha média cheia"),
    m("1 escumadeira cheia", 85, P, "6300101 Arroz cozido - escumadeira média cheia"),
    m("1 colher de sobremesa cheia", 12.5, P, "6300101 Arroz cozido - 1/2 colher de sopa cheia"),
    m("1 colher de chá cheia", 6.3, P, "6300101 Arroz cozido - 1/4 colher de sopa cheia"),
  ],
  "Arroz integral (cozido)": [
    m("1 colher de sopa cheia", 20, P, "6300201 Arroz integral cozido - colher de sopa cheia"),
    m("1 colher de servir cheia", 63, P, "6300201 Arroz integral cozido - colher de arroz cheia"),
    m("1 concha cheia", 117, P, "6300201 Arroz integral cozido - concha média cheia"),
    m("1 escumadeira cheia", 59, P, "6300201 Arroz integral cozido - escumadeira média cheia"),
    m("1 colher de sobremesa cheia", 10, P, "6300201 Arroz integral cozido - 1/2 colher de sopa cheia"),
    m("1 colher de chá cheia", 5, P, "6300201 Arroz integral cozido - 1/4 colher de sopa cheia"),
  ],
  "Macarrão de trigo comum (cozido)": [
    m("1 colher de sopa cheia", 25, P, "6503401 Macarrão cozido - colher de sopa cheia"),
    m("1 colher de servir cheia", 50, P, "6503401 Macarrão cozido - colher de arroz cheia"),
    m("1 escumadeira cheia", 110, P, "6503401 Macarrão cozido - escumadeira média cheia"),
    m("1 pegador", 110, P, "6503401 Macarrão cozido - pegador"),
    m("1 colher de sobremesa cheia", 12.5, P, "6503401 Macarrão cozido - 1/2 colher de sopa cheia"),
    m("1 colher de chá cheia", 6.3, P, "6503401 Macarrão cozido - 1/4 colher de sopa cheia"),
  ],
  "Macarrão integral (cozido)": [
    m("1 colher de sopa cheia", 25, P, "6503401 Macarrão cozido - colher de sopa cheia"),
    m("1 colher de servir cheia", 50, P, "6503401 Macarrão cozido - colher de arroz cheia"),
    m("1 escumadeira cheia", 110, P, "6503401 Macarrão cozido - escumadeira média cheia"),
    m("1 pegador", 110, P, "6503401 Macarrão cozido - pegador"),
    m("1 colher de sobremesa cheia", 12.5, P, "6503401 Macarrão cozido - 1/2 colher de sopa cheia"),
    m("1 colher de chá cheia", 6.3, P, "6503401 Macarrão cozido - 1/4 colher de sopa cheia"),
  ],
  "Macarrão de arroz (cozido)": [
    m("1 colher de sopa cheia", 25, P, "6503401 Macarrão cozido - colher de sopa cheia"),
    m("1 colher de servir cheia", 50, P, "6503401 Macarrão cozido - colher de arroz cheia"),
    m("1 escumadeira cheia", 110, P, "6503401 Macarrão cozido - escumadeira média cheia"),
    m("1 pegador", 110, P, "6503401 Macarrão cozido - pegador"),
    m("1 colher de sobremesa cheia", 12.5, P, "6503401 Macarrão cozido - 1/2 colher de sopa cheia"),
    m("1 colher de chá cheia", 6.3, P, "6503401 Macarrão cozido - 1/4 colher de sopa cheia"),
  ],
  "Batata doce (cozida)": [
    m("1 unidade", 355, P, "6400401 Batata doce cozida - unidade média"),
    m("1 fatia", 70, P, "6400401 Batata doce cozida - fatia média"),
    m("1 colher de sopa cheia", 42, P, "6400401 Batata doce cozida - colher de sopa cheia"),
    m("1 colher de servir", 100, GUIA, "6400401 Batata doce cozida - colher de servir"),
  ],
  "Batata inglesa (cozida)": [
    m("1 unidade", 140, P, "6400101 Batata inglesa cozida - unidade média"),
    m("1 colher de sopa cheia", 30, P, "6400101 Batata inglesa cozida - colher de sopa cheia"),
    m("1 colher de servir cheia", 60, P, "6400101 Batata inglesa cozida - colher de arroz cheia"),
    m("1 escumadeira cheia", 80, P, "6400101 Batata inglesa cozida - escumadeira média cheia"),
    m("1 colher de sobremesa cheia", 15, P, "6400101 Batata inglesa cozida - 1/2 colher de sopa cheia"),
    m("1 colher de chá cheia", 7.5, P, "6400101 Batata inglesa cozida - 1/4 colher de sopa cheia"),
  ],
  "Mandioca / Aipim (cozida)": [
    m("1 pedaço", 100, P, "6400601 Aipim cozido - pedaço médio"),
    m("1 colher de sopa cheia", 30, P, "6400601 Aipim cozido - colher de sopa cheia picado"),
    m("1 colher de servir cheia", 60, P, "6400601 Aipim cozido - colher de arroz cheia picado"),
  ],
  "Inhame (cozido)": [
    m("1 unidade", 125, P, "6400501 Inhame cozido - unidade média"),
    m("1 pedaço", 60, P, "6400501 Inhame cozido - pedaço médio"),
    m("1 colher de sopa cheia", 35, P, "6400501 Inhame cozido - colher de sopa cheia"),
    m("1 colher de servir cheia", 62, P, "6400501 Inhame cozido - colher de arroz cheia"),
    m("1 escumadeira cheia", 110, P, "6400501 Inhame cozido - escumadeira média cheia"),
  ],
  "Pão francês": [
    m("1 unidade", 50, P, "8000105 Pão francês - unidade"),
  ],
  "Pão de forma tradicional": [
    m("1 fatia", 25, P, "8000501 Pão de forma branco - unidade"), // o IBGE chama a fatia de "unidade"
  ],
  "Pão de forma integral": [
    m("1 fatia", 25, P, "8001401 Pão de forma de aveia - unidade"), // o IBGE chama a fatia de "unidade"
  ],
  "Cuscuz de milho (preparado)": [
    m("1 pedaço", 135, P, "6902901 Cuscuz de milho - pedaço médio"),
  ],
  "Aveia em flocos": [
    m("1 colher de sopa cheia", 15, P, "6500401 Aveia flocos - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 7, P, "6500401 Aveia flocos - colher de sobremesa cheia"),
    m("1 colher de chá cheia", 2, P, "6500401 Aveia flocos - colher de chá cheia"),
  ],
  "Feijão carioca (cozido)": [
    m("1 colher de sopa cheia", 17, P, "6303102 Feijão branco cozido - colher de sopa cheia"), // o IBGE usa o feijão branco para todos os feijões
    m("1 colher de servir cheia", 35, P, "6303102 Feijão branco cozido - colher de arroz cheia"), // o IBGE usa o feijão branco para todos os feijões
    m("1 concha cheia", 140, P, "6303102 Feijão branco cozido - concha média cheia"), // o IBGE usa o feijão branco para todos os feijões
    m("1 colher de sobremesa cheia", 8.5, P, "6303102 Feijão branco cozido - 1/2 colher de sopa cheia"), // o IBGE usa o feijão branco para todos os feijões
    m("1 colher de chá cheia", 4.3, P, "6303102 Feijão branco cozido - 1/4 colher de sopa cheia"), // o IBGE usa o feijão branco para todos os feijões
  ],
  "Feijão preto (cozido)": [
    m("1 colher de sopa cheia", 17, P, "6303102 Feijão branco cozido - colher de sopa cheia"), // o IBGE usa o feijão branco para todos os feijões
    m("1 colher de servir cheia", 35, P, "6303102 Feijão branco cozido - colher de arroz cheia"), // o IBGE usa o feijão branco para todos os feijões
    m("1 concha cheia", 140, P, "6303102 Feijão branco cozido - concha média cheia"), // o IBGE usa o feijão branco para todos os feijões
    m("1 colher de sobremesa cheia", 8.5, P, "6303102 Feijão branco cozido - 1/2 colher de sopa cheia"), // o IBGE usa o feijão branco para todos os feijões
    m("1 colher de chá cheia", 4.3, P, "6303102 Feijão branco cozido - 1/4 colher de sopa cheia"), // o IBGE usa o feijão branco para todos os feijões
  ],
  "Lentilha (cozida)": [
    m("1 colher de sopa", 18, P, "6302901 Lentilha cozida - colher de sopa"),
    m("1 colher de servir", 32, P, "6302901 Lentilha cozida - colher de arroz"),
    m("1 concha cheia", 160, P, "6302901 Lentilha cozida - concha média cheia"),
  ],
  "Grão-de-bico (cozido)": [
    m("1 colher de sopa cheia", 22, P, "6302801 Grão de bico - colher de sopa cheia"),
    m("1 colher de servir cheia", 45, P, "6302801 Grão de bico - colher de arroz cheia"),
    m("1 concha cheia", 120, P, "6302801 Grão de bico - concha média cheia"),
  ],
  "Pipoca (estourada sem óleo)": [
    m("1 colher de servir", 3, UNI, "8501202 Pipoca - colher de arroz"),
    m("1 concha", 6, UNI, "8501202 Pipoca - concha"),
    m("1 xícara (chá)", 6, UNI, "8501202 Pipoca - xícara de chá"),
    m("1 punhado", 2, UNI, "8501202 Pipoca - punhado"),
  ],
  "Açúcar branco / refinado": [
    m("1 colher de sopa cheia", 24, P, "6906602 Açúcar refinado - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 16, P, "6906602 Açúcar refinado - colher de sobremesa cheia"),
    m("1 colher de chá cheia", 5, P, "6906602 Açúcar refinado - colher de chá cheia"),
  ],
  "Açúcar mascavo": [
    m("1 colher de sopa cheia", 19, P, "6900304 Açúcar mascavo - colher de sopa cheia"),
  ],
  "Mel de abelha": [
    m("1 colher de sopa", 15, P, "6901602 Mel de abelha - colher de sopa"),
    m("1 colher de sobremesa", 9, P, "6901602 Mel de abelha - colher de sobremesa"),
    m("1 colher de chá", 3, P, "6901602 Mel de abelha - colher de chá"),
  ],
  // ── Proteínas ──
  "Frango peito s/ pele (grelhado)": [
    m("1 filé", 100, P, "7800401 Frango frito - filé médio"), // filé de frango frito
  ],
  "Frango peito s/ pele (desfiado)": [
    m("1 colher de sopa cheia", 20, P, "7800401 Frango assado - colher de sopa cheia desfiado"),
  ],
  "Frango coxa+sobrecoxa (assado)": [
    m("1 colher de sopa cheia", 20, P, "7800302 Frango assado - colher de sopa cheia desfiado"),
  ],
  "Frango coxa+sobrecoxa s/ pele (cozida)": [
    m("1 colher de sopa cheia", 20, P, "7800302 Frango assado - colher de sopa cheia desfiado"),
  ],
  "Frango coxa+sobrecoxa c/ pele (assada)": [
    m("1 colher de sopa cheia", 20, P, "7800302 Frango assado - colher de sopa cheia desfiado"),
  ],
  "Patinho (moído/cozido)": [
    m("1 colher de sopa cheia", 25, P, "7104301 Carne bovina moída - colher de sopa cheia"),
    m("1 colher de servir cheia", 60, P, "7104301 Carne bovina moída - colher de arroz cheia"),
    m("1 colher de sobremesa cheia", 12.5, P, "7104301 Carne bovina moída - 1/2 colher de sopa cheia"),
  ],
  "Filé Mignon (grelhado)": [
    m("1 bife", 100, P, "7100101 Bife bovino - unidade média"), // medida geral de carne bovina do IBGE
    m("1 pedaço", 35, P, "7100101 Carne bovina ensopada - pedaço médio"), // medida geral de carne bovina do IBGE
  ],
  "Alcatra (grelhada)": [
    m("1 pedaço", 35, P, "7100301 Carne bovina ensopada - pedaço médio"), // medida geral de carne bovina do IBGE
  ],
  "Coxão mole (cozido)": [
    m("1 fatia", 90, P, "7109101 Carne bovina assada - fatia média"), // medida geral de carne bovina do IBGE
    m("1 pedaço", 35, P, "7109101 Carne bovina ensopada - pedaço médio"), // medida geral de carne bovina do IBGE
    m("1 colher de sopa cheia", 30, P, "7109101 Carne bovina ensopada - colher de sopa cheia"), // medida geral de carne bovina do IBGE
  ],
  "Coxão duro (cozido)": [
    m("1 fatia", 90, P, "7109101 Carne bovina assada - fatia média"), // medida geral de carne bovina do IBGE
    m("1 pedaço", 35, P, "7109101 Carne bovina ensopada - pedaço médio"), // medida geral de carne bovina do IBGE
    m("1 colher de sopa cheia", 30, P, "7109101 Carne bovina ensopada - colher de sopa cheia"), // medida geral de carne bovina do IBGE
  ],
  "Lagarto (cozido)": [
    m("1 pedaço", 35, P, "7106401 Carne bovina ensopada - pedaço médio"), // medida geral de carne bovina do IBGE
  ],
  "Acém (cozido)": [
    m("1 pedaço", 35, P, "7100801 Carne bovina ensopada - pedaço médio"), // medida geral de carne bovina do IBGE
  ],
  "Músculo (cozido)": [
    m("1 pedaço", 35, P, "7101001 Carne bovina ensopada - pedaço médio"), // medida geral de carne bovina do IBGE
    m("1 colher de sopa cheia", 30, P, "7101001 Carne bovina ensopada - colher de sopa cheia"), // medida geral de carne bovina do IBGE
  ],
  "Contra-filé (grelhado)": [
    m("1 pedaço", 35, P, "7100201 Carne bovina ensopada - pedaço médio"), // medida geral de carne bovina do IBGE
  ],
  "Picanha c/ gordura (grelhada)": [
    m("1 fatia", 90, P, "7100304 Carne bovina assada - fatia média"), // medida geral de carne bovina do IBGE
    m("1 pedaço", 35, P, "7100304 Carne bovina ensopada - pedaço médio"), // medida geral de carne bovina do IBGE
  ],
  "Picanha s/ gordura (grelhada)": [
    m("1 fatia", 90, P, "7100304 Carne bovina assada - fatia média"), // medida geral de carne bovina do IBGE
    m("1 pedaço", 35, P, "7100304 Carne bovina ensopada - pedaço médio"), // medida geral de carne bovina do IBGE
  ],
  "Fígado bovino (grelhado)": [
    m("1 bife", 100, P, "7102501 Bife de fígado bovino - unidade média"),
  ],
  "Costela bovina c/ gordura (cozida)": [
    m("1 pedaço", 40, P, "7101301 Costela de boi assada - pedaço médio"),
  ],
  "Costela bovina s/ gordura (cozida)": [
    m("1 pedaço", 40, P, "7101301 Costela de boi assada - pedaço médio"),
  ],
  "Cupim (assado)": [
    m("1 fatia", 90, P, "7102601 Carne bovina assada - fatia média"), // medida geral de carne bovina do IBGE
    m("1 pedaço", 35, P, "7102601 Carne bovina ensopada - pedaço médio"), // medida geral de carne bovina do IBGE
  ],
  "Maminha (grelhada)": [
    m("1 pedaço", 35, P, "7100303 Carne bovina ensopada - pedaço médio"), // medida geral de carne bovina do IBGE
  ],
  "Fraldinha (grelhada)": [
    m("1 pedaço", 35, P, "7101202 Carne bovina ensopada - pedaço médio"), // medida geral de carne bovina do IBGE
  ],
  "Lombo suíno (assado)": [
    m("1 fatia", 190, GUIA, "7103701 Porco lombo assado - 1 fatia"),
  ],
  "Pernil suíno (assado)": [
    m("1 fatia", 42, TOM, "7106301 Pernil assado - 1 fatia"),
  ],
  "Tilápia (grelhada/assada)": [
    m("1 filé", 120, P, "7400101 Peixe cozido - filé médio"),
    m("1 posta", 200, P, "7400101 Peixe cozido - posta média"),
  ],
  "Salmão s/ pele (grelhado)": [
    m("1 filé", 120, P, "7200101 Peixe cozido - filé médio"),
    m("1 posta", 200, P, "7200101 Peixe cozido - posta média"),
    m("1 colher de sopa cheia", 20, P, "7200101 Peixe cozido - colher de sopa cheia picado"),
  ],
  "Atum em lata (em água/drenado)": [
    m("1 colher de sopa cheia", 16, P, "7703402 Atum sólido em água e sal coqueiro - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 10, P, "7703402 Atum sólido em água e sal coqueiro - colher de sobremesa cheia"),
  ],
  "Atum em lata (em óleo/drenado)": [
    m("1 colher de sopa cheia", 16, P, "7703402 Atum sólido em água e sal coqueiro - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 10, P, "7703402 Atum sólido em água e sal coqueiro - colher de sobremesa cheia"),
  ],
  "Sardinha em lata (óleo/drenada)": [
    m("1 unidade", 41.5, P, "7703002 Sardinha em conserva - unidade média"),
  ],
  "Merluza (grelhada/assada)": [
    m("1 filé", 120, P, "7200101 Peixe cozido - filé médio"),
    m("1 posta", 200, P, "7200101 Peixe cozido - posta média"),
    m("1 colher de sopa cheia", 20, P, "7200101 Peixe cozido - colher de sopa cheia picado"),
  ],
  // ── Gorduras ──
  "Amendoim, torrado, salgado": [
    m("1 unidade", 0.8, P, "6301001 Amendoim torrado com sal - unidade"),
    m("1 colher de sopa", 17, P, "6301001 Amendoim torrado com sal - colher de sopa"),
    m("1 punhado", 30, P, "6301001 Amendoim torrado com sal - punhado"),
  ],
  "Castanha-de-caju, torrada, salgada": [
    m("1 unidade", 2.5, P, "6600801 Castanha de caju torrada - unidade média"),
    m("1 punhado", 40, P, "6600801 Castanha de caju torrada - punhado"),
  ],
  "Óleo, de soja": [
    m("1 colher de sopa", 8, P, "8400301 Óleo vegetal - colher de sopa"), // o IBGE usa a medida de óleo vegetal
    m("1 colher de chá", 2, P, "8400301 Óleo vegetal - colher de chá"), // o IBGE usa a medida de óleo vegetal
  ],
  "Azeite de oliva extra virgem": [
    m("1 colher de sopa", 8, P, "8400101 Óleo vegetal - colher de sopa"), // o IBGE usa a medida de óleo vegetal
    m("1 colher de sobremesa", 5, P, "8400101 Óleo vegetal - colher de sobremesa"), // o IBGE usa a medida de óleo vegetal
    m("1 colher de chá", 2, P, "8400101 Óleo vegetal - colher de chá"), // o IBGE usa a medida de óleo vegetal
  ],
  "Óleo de coco": [
    m("1 colher de sopa", 8, P, "8403201 Óleo vegetal - colher de sopa"), // o IBGE usa a medida de óleo vegetal
    m("1 colher de sobremesa", 5, P, "8403201 Óleo vegetal - colher de sobremesa"), // o IBGE usa a medida de óleo vegetal
  ],
  "Manteiga integral (com ou s/ sal)": [
    m("1 ponta de faca", 5, TOM, "7901501 Manteiga - ponta de faca"),
    m("1 colher de sopa cheia", 32, P, "7901501 Manteiga - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 23, P, "7901501 Manteiga - colher de sobremesa cheia"),
    m("1 colher de chá cheia", 8, P, "7901501 Manteiga - colher de chá cheia"),
  ],
  "Amendoim torrado (s/ pele/sal)": [
    m("1 unidade", 0.8, P, "6301001 Amendoim torrado com sal - unidade"),
    m("1 colher de sopa", 17, P, "6301001 Amendoim torrado com sal - colher de sopa"),
    m("1 punhado", 30, P, "6301001 Amendoim torrado com sal - punhado"),
  ],
  "Castanha de caju (torrada)": [
    m("1 unidade", 2.5, P, "6600801 Castanha de caju torrada - unidade média"),
    m("1 punhado", 40, P, "6600801 Castanha de caju torrada - punhado"),
  ],
  "Castanha do Pará / Brasil": [
    m("1 unidade", 4, P, "6600701 Castanha-do-pará - unidade"),
  ],
  "Nozes": [
    m("1 unidade", 5, P, "6601501 Noz - unidade"),
  ],
  "Amêndoa (torrada)": [
    m("1 unidade", 1, P, "6600501 Amendoa - unidade"),
  ],
  "Amêndoa (crua)": [
    m("1 unidade", 1, P, "6600501 Amendoa - unidade"),
  ],
  "Abacate (polpa)": [
    m("1 unidade", 430, P, "6802701 Abacate - unidade média"),
    m("1 colher de sopa cheia", 45, P, "6802701 Abacate - colher de sopa cheio picado"),
  ],
  "Coco fresco (polpa crua)": [
    m("1 pedaço", 40, P, "6602401 Coco da bahia - pedaço médo"),
  ],
  "Linhaça (sementes)": [
    m("1 colher de sopa", 13, UNI, "6302001 Semente de linhaça - colher de sopa"),
  ],
  // ── Laticínios ──
  "Leite de vaca integral (líquido)": [
    m("1 xícara (chá)", 206, ANVISA, "IN 75/2020, Anexo VII: xícara de chá = 200 ml"), // 200 ml × 1.03 g/ml
    m("1 copo", 206, ANVISA, "IN 75/2020, Anexo VII: copo = 200 ml"), // 200 ml × 1.03 g/ml
  ],
  "Leite de vaca desnatado (líquido)": [
    m("1 xícara (chá)", 208, ANVISA, "IN 75/2020, Anexo VII: xícara de chá = 200 ml"), // 200 ml × 1.04 g/ml
    m("1 copo", 208, ANVISA, "IN 75/2020, Anexo VII: copo = 200 ml"), // 200 ml × 1.04 g/ml
  ],
  "Leite em pó desnatado": [
    m("1 colher de sopa cheia", 10, P, "7900710 Leite de vaca desnatado pó - colher de sopa cheia"),
  ],
  "Queijo Muçarela": [
    m("1 fatia", 20, P, "7901801 Queijo mussarela - fatia média"),
  ],
  "Queijo Prato": [
    m("1 fatia", 15, P, "7901701 Queijo prato - fatia média"),
  ],
  "Queijo Minas Frescal": [
    m("1 fatia", 30, P, "7907301 Queijo minas frescal - fatia média"),
  ],
  "Queijo Minas Padrão": [
    m("1 fatia", 45, P, "7902001 Queijo minas padrão - fatia média"),
  ],
  "Queijo Parmesão (ralado)": [
    m("1 colher de sopa cheia", 15, P, "7902403 Queijo parmesão - colher de sopa cheia ralado"),
    m("1 colher de sobremesa cheia", 8, P, "7902403 Queijo parmesão - colher de sobremesa cheia ralado"),
    m("1 colher de chá cheia", 4, P, "7902403 Queijo parmesão - colher de chá cheia ralado"),
  ],
  "Queijo Cottage": [
    m("1 colher de sopa cheia", 44, P, "7902004 Queijo cottage - colher de sopa cheia"),
  ],
  "Ricota fresca": [
    m("1 fatia", 35, P, "7902201 Ricota Marília - fatia média"),
  ],
  "Requeijão cremoso tradicional": [
    m("1 ponta de faca", 6, TOM, "7902901 Requeijão - ponta de faca"),
    m("1 colher de sopa cheia", 30, P, "7902901 Requeijão - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 15, P, "7902901 Requeijão - 1/2 colher de sopa cheia"),
    m("1 colher de chá cheia", 7.5, P, "7902901 Requeijão - 1/4 colher de sopa cheia"),
  ],
  "Requeijão light": [
    m("1 ponta de faca", 6, TOM, "7902901 Requeijão - ponta de faca"),
    m("1 colher de sopa cheia", 30, P, "7906501 Requeijão - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 15, P, "7906501 Requeijão - 1/2 colher de sopa cheia"),
  ],
  "Cream cheese tradicional": [
    m("1 colher de sopa cheia", 30, P, "7902902 Requeijão cremoso - colher de sopa cheia"), // medida do requeijão cremoso
  ],
  "Cream cheese light": [
    m("1 colher de sopa cheia", 30, P, "7902902 Requeijão cremoso - colher de sopa cheia"), // medida do requeijão cremoso
  ],
  "Creme de leite (lata/caixa)": [
    m("1 colher de sopa rasa", 15, P, "7901001 Creme de leite - colher de sopa rasa"),
  ],
  "Requeijão Light Tirolez": [
    m("1 ponta de faca", 6, TOM, "7902901 Requeijão - ponta de faca"),
    m("1 colher de sopa cheia", 30, P, "7906501 Requeijão - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 15, P, "7906501 Requeijão - 1/2 colher de sopa cheia"),
  ],
  "Requeijão Light Itambé": [
    m("1 ponta de faca", 6, TOM, "7902901 Requeijão - ponta de faca"),
    m("1 colher de sopa cheia", 30, P, "7906501 Requeijão - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 15, P, "7906501 Requeijão - 1/2 colher de sopa cheia"),
  ],
  "Requeijão Tradicional Tirolez": [
    m("1 ponta de faca", 6, TOM, "7902901 Requeijão - ponta de faca"),
    m("1 colher de sopa cheia", 30, P, "7902901 Requeijão - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 15, P, "7902901 Requeijão - 1/2 colher de sopa cheia"),
    m("1 colher de chá cheia", 7.5, P, "7902901 Requeijão - 1/4 colher de sopa cheia"),
  ],
  "Requeijão Zero Lactose Tirolez": [
    m("1 ponta de faca", 6, TOM, "7902901 Requeijão - ponta de faca"),
    m("1 colher de sopa cheia", 30, P, "7902901 Requeijão - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 15, P, "7902901 Requeijão - 1/2 colher de sopa cheia"),
    m("1 colher de chá cheia", 7.5, P, "7902901 Requeijão - 1/4 colher de sopa cheia"),
  ],
  "Requeijão Zero Lactose Light Betânia": [
    m("1 ponta de faca", 6, TOM, "7902901 Requeijão - ponta de faca"),
    m("1 colher de sopa cheia", 30, P, "7906501 Requeijão - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 15, P, "7906501 Requeijão - 1/2 colher de sopa cheia"),
  ],
  // ── Frutas ──
  "Tangerina, Poncã, crua": [
    m("1 unidade", 135, P, "6802201 Tangerina - unidade média"),
  ],
  "Banana prata (crua)": [
    m("1 unidade", 75, PHI, "6801101 Banana prata - unidade"),
    m("1 fatia", 26, UNI, "6801101 Banana - fatia"),
    m("1 pedaço", 16, UNI, "6801101 Banana - pedaço"),
  ],
  "Banana nanica (crua)": [
    m("1 fatia", 26, UNI, "6801101 Banana - fatia"),
    m("1 pedaço", 16, UNI, "6801101 Banana - pedaço"),
  ],
  "Banana da terra (crua)": [
    m("1 fatia", 26, UNI, "6801101 Banana - fatia"),
    m("1 pedaço", 16, UNI, "6801101 Banana - pedaço"),
  ],
  "Maçã fuji (com casca)": [
    m("1 unidade", 150, P, "6803001 Maçã - unidade média"),
  ],
  "Maçã gala (com casca)": [
    m("1 unidade", 150, P, "6803001 Maçã - unidade média"),
  ],
  "Mamão papaia": [
    m("1 unidade", 310, P, "6803101 Mamão papaya - unidade média"),
    m("1 fatia", 170, P, "6803101 Mamão - fatia média"),
    m("1 colher de sopa cheia", 40, P, "6803101 Mamão papaya - colher de sopa cheia"),
    m("1 colher de servir cheia", 70, P, "6803101 Mamão papaya - colher de arroz cheia"),
  ],
  "Mamão formosa": [
    m("1 fatia", 170, P, "6803101 Mamão - fatia média"),
    m("1 colher de sopa cheia", 40, P, "6803101 Mamão papaya - colher de sopa cheia"),
    m("1 colher de servir cheia", 70, P, "6803101 Mamão papaya - colher de arroz cheia"),
  ],
  "Morango": [
    m("1 unidade", 12, P, "6805201 Morango - unidade média"),
  ],
  "Abacaxi": [
    m("1 unidade", 750, P, "6802601 Abacaxi - unidade média"),
    m("1 fatia", 75, P, "6802601 Abacaxi - fatia média"),
  ],
  "Manga palmer / tommy": [
    m("1 fatia", 22, GUIA, "6803201 Manga hadden - fatia"), // medida da manga hadden
  ],
  "Uva itália / rubi": [
    m("1 unidade", 8, P, "6803901 Uva - unidade média"),
  ],
  "Uva thompson / sem semente": [
    m("1 unidade", 8, P, "6803901 Uva - unidade média"),
  ],
  "Uva-passa (sem semente)": [
    m("1 unidade", 0.3, P, "6803912 Uva passa - unidade"),
    m("1 colher de sopa cheia", 18, P, "6803912 Uva passa - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 9, P, "6803912 Uva passa - 1/2 colher de sopa cheia"),
  ],
  "Suco de uva integral": [
    m("1 xícara (chá)", 210, ANVISA, "IN 75/2020, Anexo VII: xícara de chá = 200 ml"), // 200 ml × 1.05 g/ml
    m("1 copo", 210, ANVISA, "IN 75/2020, Anexo VII: copo = 200 ml"), // 200 ml × 1.05 g/ml
  ],
  "Melancia": [
    m("1 fatia", 200, P, "6803401 Melancia - fatia média"),
    m("1 pedaço", 150, TOM, "6803401 Melancia - pedaço médio"),
  ],
  "Melão": [
    m("1 unidade", 660, P, "6803501 Melão - unidade média"),
    m("1 fatia", 90, P, "6803501 Melão - fatia média"),
  ],
  "Laranja pera": [
    m("1 unidade", 180, P, "6801801 Laranja - unidade média"),
    m("1 gomo", 18, GUIA, "6801801 Laranja-bahia/seleta - gomo"), // medida da laranja-bahia/seleta
  ],
  "Suco de laranja pera (integral)": [
    m("1 xícara (chá)", 210, ANVISA, "IN 75/2020, Anexo VII: xícara de chá = 200 ml"), // 200 ml × 1.05 g/ml
    m("1 copo", 210, ANVISA, "IN 75/2020, Anexo VII: copo = 200 ml"), // 200 ml × 1.05 g/ml
  ],
  "Limão tahiti": [
    m("1 unidade", 84, GUIA, "6802001 Limão - unidade"),
  ],
  "Kiwi": [
    m("1 unidade", 94, P, "6807801 Kiwi - unidade média"),
    m("1 rodela", 11, TOM, "6807801 Kiwi - rodela"),
  ],
  "Pera (com casca)": [
    m("1 unidade", 130, P, "6803601 Pêra - unidade média"),
  ],
  "Goiaba": [
    m("1 unidade", 170, P, "6804201 Goiaba - unidade média"),
  ],
  "Maracujá (polpa)": [
    m("1 unidade", 45, P, "6803301 Maracujá - unidade média"),
  ],
  // ── Verduras e legumes ──
  "Alface, lisa, crua": [
    m("1 unidade", 200, P, "6700101 Alface - unidade média"),
    m("1 folha", 10, P, "6700101 Alface - folha média"),
    m("1 colher de sopa cheia", 8, P, "6700101 Alface - colher de sopa cheia picada"),
    m("1 colher de sobremesa cheia", 4, P, "6700101 Alface - 1/2 colher de sopa cheia picada"),
    m("1 colher de chá cheia", 2, P, "6700101 Alface - 1/4 colher de sopa cheia picada"),
  ],
  "Couve, manteiga, crua": [
    m("1 folha", 20, P, "6700501 Couve crua - folha média"),
  ],
  "Agrião, cru": [
    m("1 colher de sopa cheia", 7, P, "6701301 Agrião - colher de sopa cheia picado"),
  ],
  "Brócolis (cozido/vapor)": [
    m("1 colher de sopa cheia", 10, P, "6701704 Brócolis cozido - colher de sopa cheia picado"),
    m("1 colher de sobremesa cheia", 5, P, "6701704 Brócolis cozido - 1/2 colher de sopa cheia picado"),
  ],
  "Couve-flor (cozida)": [
    m("1 colher de sopa cheia", 25, P, "6700601 Couve flor cozida - colher de sopa cheia"),
  ],
  "Espinafre (refogado)": [
    m("1 colher de sopa cheia", 25, P, "6700701 Espinafre cozido - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 12.5, P, "6700701 Espinafre cozido - 1/2 colher de sopa cheia"),
  ],
  "Cenoura (crua)": [
    m("1 unidade", 120, P, "6401201 Cenoura crua - unidade média"),
    m("1 colher de sopa cheia", 12, P, "6401201 Cenoura crua - colher de sopa cheia ralada"),
    m("1 colher de sobremesa cheia", 6, P, "6401201 Cenoura crua - 1/2 colher de sopa cheia ralada"),
  ],
  "Cenoura (cozida)": [
    m("1 unidade", 100, P, "6401201 Cenoura cozida - unidade média"),
    m("1 fatia", 5, UNI, "6401201 Cenoura cozida - fatia"),
  ],
  "Abobrinha italiana (cozida)": [
    m("1 colher de sopa cheia", 30, P, "6703701 Abobrinha cozida - colher de sopa cheia"),
    m("1 colher de servir cheia", 70, P, "6703701 Abobrinha cozida - colher de arroz cheia"),
    m("1 escumadeira cheia", 90, P, "6703701 Abobrinha cozida - escumadeira média cheia"),
    m("1 colher de sobremesa cheia", 15, P, "6703701 Abobrinha cozida - 1/2 colher de sopa cheia"),
  ],
  "Abóbora cabotian (cozida)": [
    m("1 pedaço", 50, P, "6703901 Abóbora cozida - pedaço médio"),
    m("1 colher de sopa cheia", 36, P, "6703901 Abóbora cozida - colher de sopa cheia"),
    m("1 escumadeira cheia", 100, P, "6703901 Abóbora cozida - escumadeira média cheia"),
    m("1 colher de sobremesa cheia", 18, P, "6703901 Abóbora cozida - 1/2 colher de sopa cheia"),
    m("1 colher de chá cheia", 9, P, "6703901 Abóbora cozida - 1/4 colher de sopa cheia"),
  ],
  "Alface americana": [
    m("1 colher de sopa cheia", 8, P, "6700101 Alface - colher de sopa cheia picada"),
    m("1 colher de sobremesa cheia", 4, P, "6700101 Alface - 1/2 colher de sopa cheia picada"),
    m("1 colher de chá cheia", 2, P, "6700101 Alface - 1/4 colher de sopa cheia picada"),
  ],
  "Alface crespa": [
    m("1 unidade", 200, P, "6700101 Alface - unidade média"),
    m("1 folha", 10, P, "6700101 Alface - folha média"),
    m("1 colher de sopa cheia", 8, P, "6700101 Alface - colher de sopa cheia picada"),
    m("1 colher de sobremesa cheia", 4, P, "6700101 Alface - 1/2 colher de sopa cheia picada"),
    m("1 colher de chá cheia", 2, P, "6700101 Alface - 1/4 colher de sopa cheia picada"),
  ],
  "Tomate salada": [
    m("1 unidade", 100, P, "6705101 Tomate - unidade média"),
    m("1 fatia", 15, P, "6705101 Tomate - fatia média"),
    m("1 colher de sopa cheia", 30, P, "6705101 Tomate - colher de sopa cheia em tiras"),
    m("1 colher de sobremesa cheia", 15, P, "6705101 Tomate - 1/2 colher de sopa cheia em tiras"),
    m("1 colher de chá cheia", 7.5, P, "6705101 Tomate - 1/4 colher de sopa cheia em tiras"),
  ],
  "Pepino (cru com casca)": [
    m("1 unidade", 100, P, "6704001 Pepino - unidade média"),
    m("1 colher de sopa cheia", 18, P, "6704001 Pepino - colher de sopa cheia picado"),
    m("1 colher de sobremesa cheia", 9, P, "6704001 Pepino - 1/2 colher de sopa cheia picado"),
    m("1 colher de chá cheia", 4.5, P, "6704001 Pepino - 1/4 colher de sopa cheia picado"),
  ],
  "Chuchu (cozido)": [
    m("1 unidade", 230, P, "6704101 Chuchu cozido - unidade média"),
    m("1 pedaço", 30, P, "6704101 Chuchu cozido - pedaço"),
    m("1 colher de sopa cheia", 20, P, "6704101 Chuchu cozido - colher de sopa cheia"),
    m("1 colher de servir cheia", 45, P, "6704101 Chuchu cozido - colher de arroz cheia"),
    m("1 escumadeira cheia", 110, P, "6704101 Chuchu cozido - escumadeira média cheia"),
    m("1 colher de sobremesa cheia", 10, P, "6704101 Chuchu cozido - 1/2 colher de sopa cheia"),
  ],
  "Beterraba (crua)": [
    m("1 unidade", 140, P, "6401101 Beterraba crua - unidade média"),
    m("1 colher de sopa cheia", 16, P, "6401101 Beterraba crua - colher de sopa cheia ralada"),
    m("1 colher de sobremesa cheia", 8, P, "6401101 Beterraba crua - 1/2 colher de sopa cheia ralada"),
  ],
  "Beterraba (cozida)": [
    m("1 unidade", 125, P, "6401101 Beterraba cozida - unidade média"),
    m("1 fatia", 12, P, "6401101 Beterraba cozida - fatia média"),
    m("1 colher de sopa cheia", 20, P, "6401101 Beterraba cozida - colher de sopa cheia"),
    m("1 colher de servir cheia", 38, P, "6401101 Beterraba cozida - colher de arroz cheia"),
    m("1 escumadeira rasa", 45, P, "6401101 Beterraba cozida - escumadeira média rasa picada"),
    m("1 colher de sobremesa cheia", 10, TOM, "6401101 Beterraba cozida - 1/2 colher de sopa cheia"),
  ],
  "Repolho branco (cru)": [
    m("1 folha", 26, P, "6700901 Repolho cru - folha média"),
    m("1 colher de sopa cheia", 10, P, "6700901 Repolho cru - colher de sopa cheia"),
    m("1 colher de servir cheia", 25, P, "6700901 Repolho cru - colher de arroz cheia"),
    m("1 escumadeira cheia", 25, P, "6700901 Repolho cru - escumadeira média cheia"),
    m("1 colher de sobremesa cheia", 5, P, "6700901 Repolho cru - 1/2 colher de sopa cheia"),
    m("1 colher de chá cheia", 2.5, P, "6700901 Repolho cru - 1/4 colher de sopa cheia"),
  ],
  "Cebola (crua)": [
    m("1 unidade", 70, P, "6705701 Cebola - unidade média"),
    m("1 fatia", 6, P, "6705701 Cebola - fatia média"),
    m("1 colher de sopa cheia", 10, P, "6705701 Cebola - colher de sopa cheia"),
    m("1 colher de sobremesa cheia", 5, P, "6705701 Cebola - 1/2 colher de sopa cheia"),
    m("1 colher de chá cheia", 2.5, P, "6705701 Cebola - 1/4 colher de sopa cheia"),
  ],
  "Pimentão (cru)": [
    m("1 unidade", 55, P, "6704501 Pimentão - unidade média"),
    m("1 fatia", 6, P, "6704501 Pimentão - fatia média"),
    m("1 colher de sopa cheia", 13, P, "6704501 Pimentão - colher de sopa cheia"),
  ],
  "Albumina em pó": [m("1 scoop", 30, CADASTRO)], // era "1 unidade = 30 g" no cadastro; o scoop varia por marca
  "Proteína de Soja isolada": [m("1 scoop", 30, CADASTRO)], // era "1 unidade = 30 g" no cadastro; o scoop varia por marca
};

/**
 * Pesos de "1 unidade" antigos que na verdade eram outra medida (colher, fatia, scoop, copo) ou uma
 * porção. Saem do cadastro: a medida certa está acima. Itens já salvos não mudam (guardam os gramas).
 */
export const UNIT_WEIGHT_REMOVED: string[] = [
  "Azeite de oliva extra virgem", // era 13 g; a colher de sopa do IBGE tem 8 g
  "Óleo de coco", // era 13 g
  "Manteiga integral (com ou s/ sal)", // era 10 g (porção); medidas do IBGE acima
  "Pasta de amendoim integral", // era 15 g; fica a colher de sopa (20 g) do cadastro
  "Mel de abelha", // era 15 g = 1 colher de sopa
  "Whey Protein Concentrado (80%)", // era 30 g = 1 scoop
  "Whey Protein Isolado (90%+)", // era 30 g = 1 scoop
  "Albumina em pó", // vira "1 scoop"
  "Proteína de Soja isolada", // vira "1 scoop"
  "Queijo Muçarela", // era 30 g; fatia do IBGE = 20 g
  "Queijo Prato", // era 30 g; fatia do IBGE = 15 g
  "Queijo Minas Frescal", // era 30 g; fatia do IBGE = 30 g
  "Queijo Minas Padrão", // era 30 g; fatia do IBGE = 45 g
  "Queijo Coalho", // era 30 g; o IBGE não tem medida confiável → só gramas
  "Requeijão cremoso tradicional", // era 30 g = 1 colher de sopa cheia
  "Requeijão light", // idem
  "Cream cheese tradicional", // idem
  "Cream cheese light", // idem
  "Suco de laranja pera (integral)", // era 200 g; agora copo/xícara de 200 ml
  "Suco de uva integral", // idem
];

/** Medida (palavra + tipo de colher) para ordenar e não repetir: "colher sopa", "fatia", "unidade"… */
export function measureKey(label: string): string {
  const t = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^\s*[\d.,/]+\s*/, "");
  const words = t.split(/[^a-z]+/).filter((w) => w && w !== "de" && w !== "da" && w !== "do");
  const head = words[0] ?? "";
  if (head === "colher") {
    const q = words.slice(1).find((w) => /^(sopa|cha|sobremesa|cafe|servir|arroz)$/.test(w));
    return `colher ${q === "arroz" ? "servir" : q ?? ""}`.trim();
  }
  return head;
}

/** Ordem em que as medidas aparecem (dicas do campo e medida do aluno): inteiras, partes, colheres… */
const ORDER = [
  "unidade", "ovo", "clara", "castanha", "bife", "file", "posta", "scoop", "lata", "fatia", "pedaco",
  "rodela", "gomo", "folha", "cacho", "ponta", "colher sopa", "colher servir", "concha", "escumadeira",
  "pegador", "copo", "xicara", "punhado", "colher sobremesa", "colher cha", "colher cafe",
];
const rank = (label: string) => {
  const i = ORDER.indexOf(measureKey(label));
  return i < 0 ? ORDER.length : i;
};

/** Junta medidas sem repetir a mesma medida (a primeira da lista vence) e põe na ordem acima. */
function mergePortions(
  a: Array<{ label: string; grams: number }> | undefined,
  b: Array<{ label: string; grams: number }> | undefined,
): Array<{ label: string; grams: number }> | undefined {
  const out: Array<{ label: string; grams: number }> = [];
  const seen = new Set<string>();
  for (const p of [...(a ?? []), ...(b ?? [])]) {
    const qty = /^\s*1\s/.test(p.label) ? "1" : p.label.trim().split(/\s+/)[0];
    const k = `${qty}|${measureKey(p.label)}`;
    if (!seen.has(k) && p.grams > 0) { seen.add(k); out.push({ label: p.label, grams: p.grams }); }
  }
  out.sort((x, y) => rank(x.label) - rank(y.label));
  return out.length ? out : undefined;
}

const isOneUnit = (label: string) => /^\s*1\s+unidade\s*$/i.test(label);

/**
 * Aplica as medidas caseiras, tira os pesos de unidade que eram outra medida e unifica os pares de
 * nomes. Muda os objetos dos catálogos no carregamento (uma vez), para que qualquer leitura
 * (cálculo, busca, dicas, medida do aluno) veja o mesmo dado.
 */
export function applyHouseholdMeasures(enriched: TacoFood[], legacy: TacoFood[], industrial: TacoFood[] = []): void {
  const byName = new Map<string, TacoFood>();
  for (const f of [...enriched, ...legacy, ...industrial]) byName.set(f.name, f);
  for (const [name, measures] of Object.entries(HOUSEHOLD_MEASURES)) {
    const f = byName.get(name);
    if (f) f.portions = mergePortions(f.portions, measures);
  }
  for (const name of UNIT_WEIGHT_REMOVED) {
    const f = byName.get(name);
    if (f) delete f.unitWeight;
  }
  const removed = new Set(UNIT_WEIGHT_REMOVED);
  for (const [eName, lName] of Object.entries(ENRICHED_TO_LEGACY)) {
    const e = byName.get(eName);
    const l = byName.get(lName);
    if (!e || !l) continue;
    const portions = mergePortions(l.portions, e.portions);
    e.portions = portions;
    l.portions = portions;
    if (removed.has(lName) || removed.has(eName)) { delete l.unitWeight; delete e.unitWeight; continue; }
    const uw = l.unitWeight ?? e.unitWeight;
    if (uw != null) { l.unitWeight = uw; e.unitWeight = uw; }
  }
  // "1 unidade" das medidas é o peso da unidade: um número só para "1 unidade" e "2 unidades".
  for (const f of byName.values()) {
    const unit = f.portions?.find((p) => isOneUnit(p.label));
    if (unit) f.unitWeight = unit.grams;
  }
}
