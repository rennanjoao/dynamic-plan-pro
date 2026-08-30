/**
 * anamnesisSchema.ts
 * Constantes, helpers de upload e funções de envio de email.
 */

export const NEURO_SLIDERS = [
  { key: "neuro_motivacao",    label: "Motivação" },
  { key: "neuro_concentracao", label: "Concentração" },
  { key: "neuro_memoria",      label: "Memória de curto prazo" },
  { key: "neuro_aprendizado",  label: "Aprendizado" },
  { key: "neuro_libido",       label: "Libido" },
  { key: "neuro_prazer",       label: "Prazer com coisas simples" },
  { key: "neuro_social",       label: "Sociabilidade" },
  { key: "neuro_fluencia",     label: "Fluência verbal" },
];

export const BASELINE_KEYS = [
  "altura","peso","pescoco","cintura","quadril",
  "braco_d_relaxado","braco_e_relaxado","braco_d_contraido","braco_e_contraido","coxa_d","coxa_e","pant_d","pant_e",
] as const;

/**
 * Contexto usado para decidir se um campo condicional deve ser exibido.
 * - `reference`: dados de referência estáticos (ex.: payload da Anamnese,
 *   usado como linha de base para decidir perguntas do Check-in).
 * - `answers`: respostas já preenchidas no formulário atual (permite que um
 *   campo dependa de outro campo do mesmo formulário — ex.: só mostrar
 *   "Descreva o efeito colateral" se "Colateral" ≠ "Nenhum").
 */
export interface FieldRenderContext {
  reference?: Record<string, unknown>;
  answers?: Record<string, unknown>;
}

export interface AnamnesisField {
  key: string; label: string; type?: string; placeholder?: string; options?: string[]; step?: string | number; half?: boolean;
  /**
   * Predicado opcional: quando definido, o campo só é exibido se retornar
   * `true` para o contexto atual. Sem `condition`, o campo é sempre visível
   * — comportamento idêntico ao anterior, 100% retrocompatível.
   */
  condition?: (ctx: FieldRenderContext) => boolean;
  [k: string]: unknown;
}
export interface AnamnesisSection { id: string; title: string; fields: AnamnesisField[] }
export type FieldDef = AnamnesisField;
export type SectionDef = AnamnesisSection;

/** Avalia se um campo deve ser exibido no contexto atual. Sem `condition` definida, sempre `true`. */
export function isFieldVisible(field: AnamnesisField, ctx: FieldRenderContext): boolean {
  return field.condition ? field.condition(ctx) : true;
}

export const ANAMNESIS_SECTIONS: AnamnesisSection[] = [
  { id: "identificacao", title: "Quem é você", fields: [
    { key: "nome", label: "Nome completo", placeholder: "Digite seu nome completo" },
    { key: "data_nasc", label: "Data de nascimento", placeholder: "Ex: 15/08/1995" },
    { key: "whatsapp", label: "WhatsApp", placeholder: "(DDD) 99999-9999" },
    { key: "email", label: "E-mail", placeholder: "seu.email@exemplo.com" },
    { key: "cidade", label: "Cidade / Estado", placeholder: "Ex: São Paulo / SP" },
  ]},
  { id: "composicao", title: "Ponto de partida", fields: [
    { key: "altura", label: "Altura (cm)", placeholder: "Ex: 175" },
    { key: "peso", label: "Peso (kg)", placeholder: "Ex: 78.5" },
    { key: "pescoco", label: "Pescoço (cm)", placeholder: "Meça no meio do pescoço" },
    { key: "cintura", label: "Cintura (cm)", placeholder: "Meça na linha do umbigo" },
    { key: "quadril", label: "Quadril (cm)", placeholder: "Meça na parte mais larga" },
    { key: "braco_d_relaxado",  label: "Braço Dir. Relaxado (cm)",  type: "number", step: "0.1", half: true },
    { key: "braco_e_relaxado",  label: "Braço Esq. Relaxado (cm)",  type: "number", step: "0.1", half: true },
    { key: "braco_d_contraido", label: "Braço Dir. Contraído (cm)", type: "number", step: "0.1", half: true },
    { key: "braco_e_contraido", label: "Braço Esq. Contraído (cm)", type: "number", step: "0.1", half: true },
    { key: "coxa_d", label: "Coxa Dir. (cm)", half: true },
    { key: "coxa_e", label: "Coxa Esq. (cm)", half: true },
    { key: "pant_d", label: "Panturrilha Dir. (cm)", half: true },
    { key: "pant_e", label: "Panturrilha Esq. (cm)", half: true },
    { key: "hist_peso", label: "Como tem sido o seu histórico de peso?", placeholder: "Ex: Fui gordinho na infância, perdi 10kg ano passado, mas ganhei 3kg recentemente..." },
  ]},
  { id: "objetivos", title: "Para onde quer chegar", fields: [
    { key: "meta_prioridade", label: "Qual a sua prioridade máxima agora?", type: "choices", options: ["Hipertrofia", "Perda de gordura", "Recomposição", "Performance", "Saúde"] },
    { key: "objetivos", label: "Objetivos detalhados", placeholder: "Descreva exatamente o corpo e o resultado que você deseja alcançar." },
    { key: "musculo_enfase", label: "Qual músculo você quer dar mais ênfase?", placeholder: "Ex: Quero focar muito no peitoral e ombros (ou glúteos e pernas)." },
    { key: "shape_inspiracao", label: "Anexe a foto de um shape que admira (Opcional)", type: "image" },
  ]},
  { id: "rotina", title: "Sua rotina real", fields: [
    { key: "profissao", label: "Profissão e horário de trabalho", placeholder: "Ex: Advogado, trabalho sentado das 09h às 18h." },
    { key: "estudos", label: "Você estuda? Qual o horário?", placeholder: "Ex: Faculdade à noite (19h as 22:30h)." },
    { key: "horario_dormir", label: "Que horas você costuma dormir?", placeholder: "Ex: Em torno das 23:30h." },
    { key: "horario_acordar", label: "Que horas você costuma acordar?", placeholder: "Ex: Geralmente às 06:00h." },
  ]},
  { id: "treino", title: "Disponibilidade e Histórico de Treino", fields: [
    { key: "anos_treino", label: "Há quanto tempo você treina de forma ininterrupta?", placeholder: "Ex: Treino há 3 anos seguidos sem parar." },
    { key: "nivel_treino", label: "Como você avalia seu nível na musculação?", type: "choices", options: ["Iniciante", "Intermediário", "Avançado"] },
    { key: "atividades", label: "Pratica outros esportes ou atividades físicas?", placeholder: "Ex: Jogo futebol de terça e quinta, faço jiu-jitsu..." },
    { key: "descricao_treino", label: "Descreva como é o seu treino atual", placeholder: "Ex: Faço um ABC 2x (Costas, Peito, Pernas). Costumo fazer 4 séries de 10 a 12 repetições." },
    { key: "dificuldade_treino", label: "Qual a sua maior dificuldade nos treinos hoje?", placeholder: "Ex: Sinto dor na lombar, não consigo aumentar a carga no supino, canso muito rápido..." },
    { key: "musculo_facilidade", label: "Qual músculo você acha que desenvolve com mais facilidade?", placeholder: "Ex: Minhas costas e braços crescem muito rápido." },
    { key: "dias_treino", label: "Quantos dias livres na semana você tem para treinar?", placeholder: "Ex: 4 a 5 dias." },
    { key: "duracao_sessao", label: "Duração máxima disponível por treino", placeholder: "Ex: Tenho no máximo 60 minutos livres." },
    { key: "horarios_treino", label: "Em qual horário você vai treinar?", placeholder: "Ex: Nas manhãs (07h) ou noites (19h)." },
    { key: "aerobico_separado", label: "Consegue fazer aeróbico em um horário separado do treino?", placeholder: "Ex: Sim, 30 min de manhã sem prejudicar o sono. (Ou: Não, tem que ser junto do treino)." },
    { key: "tem_academia", label: "Você vai treinar em academia comercial?", type: "choices", options: ["Sim", "Home gym", "Não"] },
    { key: "equipamentos", label: "Se for Home Gym ou em casa, quais equipamentos possui?", placeholder: "Ex: Tenho 2 halteres montáveis, elásticos e barra fixa." },
    { key: "descanso_treino", label: "Sem descanso (Deload): Há quanto tempo treinando direto sem pausa?", placeholder: "Ex: Estou há 8 meses treinando pesado direto, sem tirar uma semana leve." },
    { key: "pump", label: "Como é o seu 'Pump' (inchaço muscular) durante os treinos?", type: "choices", options: ["Inexistente", "Fraco", "Bom", "Ótimo"] },
    { key: "lesoes", label: "Você tem alguma dor crônica ou lesão diagnosticada?", placeholder: "Ex: Dor no joelho direito ao agachar, hérnia de disco (L4-L5)..." },
  ]},
  { id: "substancias", title: "Histórico de substâncias", fields: [
    { key: "remedios", label: "Toma algum remédio prescrito? Quais?", placeholder: "Ex: Roacutan, remédio para pressão, ansiolítico..." },
    { key: "drogas", label: "Usa drogas lícitas (álcool/cigarro) ou ilícitas?", placeholder: "Ex: Bebo 3 cervejas no final de semana. Não fumo." },
    { key: "usa_hormonio_atualmente", label: "Usa hormônios/anabolizantes atualmente?", type: "choices", options: ["Sim", "Não"] },
    { key: "hormonios", label: "Se já usou ou usa hormônios, detalhe o protocolo", placeholder: "Ex: Uso Durateston 250mg/semana há 6 meses..." },
    { key: "estimulantes", label: "Usa estimulantes pesados?", placeholder: "Ex: Pré-treino com muita cafeína, clembuterol, ritalina..." },
    { key: "suplementacao", label: "Quais suplementos você usa atualmente?", placeholder: "Ex: Whey, Creatina (5g) e Ômega 3." },
  ]},
  { id: "alimentacao", title: "Alimentação & digestão", fields: [
    { key: "dificuldade_alimentacao", label: "Qual a sua maior dificuldade na dieta?", placeholder: "Ex: Sinto muita vontade de doce à noite, ou não consigo comer muito no café da manhã." },
    { key: "hidratacao", label: "Quantidade de água pura bebida por dia", type: "choices", options: ["≤1L", "2L", "3L", "4L", "5L+"] },
    { key: "tolerancia_volume", label: "Como é sua tolerância a comer muito de uma vez?", type: "choices", options: ["Alta", "Moderada", "Baixa", "Muito baixa"] },
    { key: "recordatorio", label: "Descreva resumidamente um dia normal de alimentação sua", placeholder: "Ex: Acordo e como pão com ovo. No almoço arroz, feijão e frango. À tarde um iogurte..." },
    { key: "disponibilidade_alim", label: "Tem facilidade para preparar as refeições no dia a dia?", placeholder: "Ex: Almoço em restaurante, mas janto em casa. Posso levar marmita." },
    { key: "alergias", label: "Tem alergias ou intolerâncias a algum alimento?", placeholder: "Ex: Intolerância à lactose, não gosto de batata doce..." },
    { key: "rel_comida", label: "Como é a sua relação com a comida?", placeholder: "Ex: Normal, como quando tenho fome. Ou: Desconto estresse na comida." },
    { key: "compulsao_estado", label: "Costuma ter episódios de compulsão alimentar?", type: "choices", options: ["Não", "Leve", "Forte"] },
    { key: "compulsao_horario", label: "Se sim, qual horário ou gatilho da compulsão?", placeholder: "Ex: Chegando em casa do trabalho cansado(a) ou por ansiedade." },
    { key: "fezes", label: "Consistência geral das fezes", type: "choices", options: ["Preso", "Irregular", "Normal", "Solto"] },
    { key: "gastrico", label: "Tem queimação, refluxo ou azia frequente?", placeholder: "Ex: Sinto muita azia depois do café da manhã." },
    { key: "obs_fezes", label: "Observações extras sobre o intestino", placeholder: "Ex: Fico muitos dias sem ir ao banheiro se não comer fibra." },
  ]},
  { id: "sono", title: "Descanso & recuperação", fields: [
    { key: "tempo_sono", label: "Demora muito para pegar no sono?", placeholder: "Ex: Rolo na cama por 1 hora antes de dormir." },
    { key: "pico_cansaco", label: "Qual horário você sente mais cansaço/sono no dia?", placeholder: "Ex: Logo após o almoço bate um cansaço forte." },
    { key: "acorda_descansado", label: "Você já acorda com a sensação de estar descansado?", type: "choices", options: ["Sim", "Às vezes", "Não"] },
    { key: "acorda_noite", label: "Costuma acordar no meio da madrugada?", placeholder: "Ex: Acordo 2x pra fazer xixi." },
    { key: "sintomas_noturnos", label: "Tem suores frios, cãibras ou apneia à noite?", placeholder: "Ex: Suo muito dormindo." },
    { key: "hrv", label: "Acompanha seu HRV (Variabilidade da Frequência Cardíaca)?", placeholder: "Ex: Uso Apple Watch, média de 60ms. (Deixe em branco se não souber)" },
  ]},
  { id: "neuro", title: "Como você se sente", fields: [
    ...NEURO_SLIDERS.map(s => ({ key: s.key, label: s.label })),
    { key: "obs_neuro", label: "Deseja comentar sobre como tem se sentido emocionalmente?", placeholder: "Ex: Estou passando por uma fase muito estressante no trabalho..." },
  ]},
  { id: "saude_hormonal", title: "Saúde hormonal", fields: [
    { key: "gender", label: "Gênero (Genético)", type: "choices", options: ["F", "M"] },
    { key: "ciclo_regular", label: "Como é o seu ciclo menstrual?", type: "choices", options: ["Regular", "Irregular", "Ausente"] },
    { key: "tpm", label: "Sente muitos sintomas de TPM?", placeholder: "Ex: Muita cólica e vontade insaciável de comer chocolate." },
    { key: "queda_capilar_f", label: "Notou queda capilar recentemente? (Mulheres)", placeholder: "Ex: Sim, no meio do cabelo durante o banho." },
    { key: "queda_causa_f", label: "Qual você acha que foi a causa da queda?", placeholder: "Ex: Começou após mudar anticoncepcional ou muito estresse." },
    { key: "erecao_matinal", label: "Como está sua ereção matinal? (Homens)", type: "choices", options: ["Forte", "Normal", "Fraca", "Ausente"] },
    { key: "queda_masc", label: "Tem tendência ou nota queda capilar? (Homens)", type: "choices", options: ["Sem queda", "Entradas", "Vértex", "Avançada"] },
    { key: "hist_pai", label: "Grau de calvície do seu PAI", type: "choices", options: ["Cheio", "Parcial", "Total"] },
    { key: "hist_avo_mat", label: "Grau de calvície do AVÔ MATERNO", type: "choices", options: ["Cheio", "Parcial", "Total"] },
  ]},
  { id: "clinico", title: "Histórico clínico", fields: [
    { key: "temperatura", label: "Costuma aferir a temperatura corporal ao acordar?", placeholder: "Ex: Geralmente 36.5°C. (Deixe em branco se não souber)" },
    { key: "doencas", label: "Possui doenças crônicas ou autoimunes?", placeholder: "Ex: Hipotireoidismo, diabetes, asma..." },
    { key: "mudancas_neg", label: "Notou mudanças negativas na saúde nos últimos 3 anos?", placeholder: "Ex: Imunidade ficou muito baixa, vivo resfriado." },
    { key: "cirurgias", label: "Já fez cirurgias relevantes?", placeholder: "Ex: Operei o ombro direito em 2020." },
    { key: "implantes", label: "Possui implantes, pinos ou DIU (Qual)?", placeholder: "Ex: DIU Mirena." },
    { key: "obs_finais", label: "Quer deixar alguma observação extra para o Coach?", placeholder: "Conte aqui qualquer outra coisa que considere importante eu saber." },
  ]},
];

export function extractBaseline(payload: Record<string, unknown>) {
  const b: Record<string, number> = {};
  for (const k of BASELINE_KEYS) {
    const v = payload[k];
    const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
    if (!isNaN(n)) b[k] = n;
  }
  return b;
}
