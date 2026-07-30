/**
 * anamnesisSchema.ts
 * Constantes, helpers de upload e funções de envio de email.
 */

export const CLOUDINARY_CLOUD = "dkpgoisly";
export const CLOUDINARY_PRESET = "Fitness";

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
    { key: "nome", label: "Nome completo" },
    { key: "data_nasc", label: "Data de nascimento" },
    { key: "whatsapp", label: "WhatsApp" },
    { key: "email", label: "E-mail" },
    { key: "cidade", label: "Cidade / Estado" },
  ]},
  { id: "composicao", title: "Ponto de partida", fields: [
    { key: "altura", label: "Altura (cm)" },
    { key: "peso", label: "Peso (kg)" },
    { key: "pescoco", label: "Pescoço (cm)" },
    { key: "cintura", label: "Cintura (cm)" },
    { key: "quadril", label: "Quadril (cm)" },
    { key: "braco_d_relaxado",  label: "Braço D Relaxado (cm)",  type: "number", step: "0.1", half: true },
    { key: "braco_e_relaxado",  label: "Braço E Relaxado (cm)",  type: "number", step: "0.1", half: true },
    { key: "braco_d_contraido", label: "Braço D Contraído (cm)", type: "number", step: "0.1", half: true },
    { key: "braco_e_contraido", label: "Braço E Contraído (cm)", type: "number", step: "0.1", half: true },
    { key: "coxa_d", label: "Coxa D (cm)" },
    { key: "coxa_e", label: "Coxa E (cm)" },
    { key: "pant_d", label: "Pant. D (cm)" },
    { key: "pant_e", label: "Pant. E (cm)" },
    { key: "hist_peso", label: "Histórico de peso" },
  ]},
  { id: "objetivos", title: "Para onde quer chegar", fields: [
    { key: "meta_peso", label: "Peso alvo (kg)" },
    { key: "meta_prazo", label: "Prazo (meses)" },
    { key: "meta_prioridade", label: "Prioridade", type: "choices", options: ["Hipertrofia", "Perda de gordura", "Recomposição", "Performance", "Saúde"] },
    { key: "objetivos", label: "Objetivos detalhados" },
  ]},
  { id: "rotina", title: "Sua rotina real", fields: [
    { key: "profissao", label: "Profissão e horário" },
    { key: "estudos", label: "Estudos" },
    { key: "horario_dormir", label: "Dorme às" },
    { key: "horario_acordar", label: "Acorda às" },
  ]},
  { id: "treino", title: "Histórico de treino", fields: [
    { key: "anos_treino", label: "Anos treinando" },
    { key: "nivel_treino", label: "Nível", type: "choices", options: ["Iniciante", "Intermediário", "Avançado"] },
    { key: "atividades", label: "Atividades atuais" },
    { key: "horarios_treino", label: "Horários dos treinos" },
    { key: "dias_treino", label: "Dias/semana" },
    { key: "duracao_sessao", label: "Duração máxima" },
    { key: "aerobico_separado", label: "Aeróbico em horário separado" },
    { key: "tem_academia", label: "Academia?", type: "choices", options: ["Sim", "Home gym", "Não"] },
    { key: "equipamentos", label: "Equipamentos" },
    { key: "descanso_treino", label: "Tempo sem treinar" },
    { key: "pump", label: "Pump no treino", type: "choices", options: ["Inexistente", "Fraco", "Bom", "Ótimo"] },
    { key: "lesoes", label: "Lesões" },
  ]},
  { id: "substancias", title: "Histórico de substâncias", fields: [
    { key: "remedios", label: "Remédios prescritos" },
    { key: "drogas", label: "Drogas lícitas/ilícitas" },
    { key: "hormonios", label: "Hormônios / anabolizantes" },
    { key: "estimulantes", label: "Estimulantes" },
    { key: "suplementacao", label: "Suplementação atual" },
  ]},
  { id: "alimentacao", title: "Alimentação & digestão", fields: [
    { key: "hidratacao", label: "Água/dia", type: "choices", options: ["≤1L", "2L", "3L", "4L", "5L+"] },
    { key: "recordatorio", label: "Recordatório alimentar" },
    { key: "disponibilidade_alim", label: "Disponibilidade alimentar" },
    { key: "alergias", label: "Alergias / intolerâncias" },
    { key: "rel_comida", label: "Relação com comida" },
    { key: "compulsao_estado", label: "Compulsão alimentar", type: "choices", options: ["Não", "Leve", "Forte"] },
    { key: "compulsao_horario", label: "Horário/gatilho" },
    { key: "fezes", label: "Consistência das fezes", type: "choices", options: ["Preso", "Irregular", "Normal", "Solto"] },
    { key: "gastrico", label: "Refluxo / gastrite / azia" },
    { key: "obs_fezes", label: "Obs. intestino" },
  ]},
  { id: "sono", title: "Descanso & recuperação", fields: [
    { key: "tempo_sono", label: "Tempo para dormir" },
    { key: "pico_cansaco", label: "Pico de cansaço" },
    { key: "acorda_descansado", label: "Acorda descansado?", type: "choices", options: ["Sim", "Às vezes", "Não"] },
    { key: "acorda_noite", label: "Acorda à noite?" },
    { key: "sintomas_noturnos", label: "Sintomas noturnos" },
    { key: "hrv", label: "HRV" },
  ]},
  { id: "neuro", title: "Como você se sente", fields: [
    ...NEURO_SLIDERS.map(s => ({ key: s.key, label: s.label })),
    { key: "obs_neuro", label: "Observações" },
  ]},
  { id: "saude_hormonal", title: "Saúde hormonal", fields: [
    { key: "gender", label: "Gênero", type: "choices", options: ["F", "M"] },
    { key: "ciclo_regular", label: "Ciclo menstrual", type: "choices", options: ["Regular", "Irregular", "Ausente"] },
    { key: "tpm", label: "Sintomas de TPM" },
    { key: "queda_capilar_f", label: "Queda capilar (onde)" },
    { key: "queda_causa_f", label: "Fator desencadeante da queda" },
    { key: "erecao_matinal", label: "Ereção matinal", type: "choices", options: ["Forte", "Normal", "Fraca", "Ausente"] },
    { key: "queda_masc", label: "Queda capilar", type: "choices", options: ["Sem queda", "Entradas", "Vértex", "Avançada"] },
    { key: "hist_pai", label: "Calvície do pai", type: "choices", options: ["Cheio", "Parcial", "Total"] },
    { key: "hist_avo_mat", label: "Calvície do avô materno", type: "choices", options: ["Cheio", "Parcial", "Total"] },
  ]},
  { id: "clinico", title: "Histórico clínico", fields: [
    { key: "temperatura", label: "Temperatura ao acordar" },
    { key: "doencas", label: "Doenças" },
    { key: "mudancas_neg", label: "Mudanças negativas (últimos 3 anos)" },
    { key: "cirurgias", label: "Cirurgias" },
    { key: "canal", label: "Canal dentário" },
    { key: "implantes", label: "Implantes / metal" },
    { key: "obs_finais", label: "Observações finais" },
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

export async function uploadToCloudinary(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
    { method: "POST", body: fd }
  );
  const data = await res.json();
  return data.secure_url as string;
}

/**
 * Upload de arquivo bruto (PDF, docs) para o Cloudinary usando o mesmo
 * upload_preset das fotos. Endpoint `raw/upload` preserva o tipo original
 * sem tentar tratar como imagem.
 */
export async function uploadRawToCloudinary(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_PRESET);
  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/raw/upload`,
    { method: "POST", body: fd }
  );
  const data = await res.json();
  if (!data.secure_url) throw new Error(data.error?.message || "Falha no upload");
  return data.secure_url as string;
}

// Envio de email ao coach agora é feito exclusivamente pela edge function
// `notify-coach` (Resend). As funções legadas Web3Forms foram removidas
// para evitar entrega a destinatários hardcoded.
