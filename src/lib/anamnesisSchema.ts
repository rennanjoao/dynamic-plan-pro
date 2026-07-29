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

export interface AnamnesisField { key: string; label: string; type?: string; placeholder?: string; options?: string[]; step?: string | number; half?: boolean; [k: string]: unknown }
export interface AnamnesisSection { id: string; title: string; fields: AnamnesisField[] }
export type FieldDef = AnamnesisField;
export type SectionDef = AnamnesisSection;

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
    { key: "meta_prioridade", label: "Prioridade" },
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
    { key: "nivel_treino", label: "Nível" },
    { key: "atividades", label: "Atividades atuais" },
    { key: "horarios_treino", label: "Horários dos treinos" },
    { key: "dias_treino", label: "Dias/semana" },
    { key: "duracao_sessao", label: "Duração máxima" },
    { key: "tem_academia", label: "Academia?" },
    { key: "equipamentos", label: "Equipamentos" },
    { key: "descanso_treino", label: "Tempo sem treinar" },
    { key: "pump", label: "Pump no treino" },
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
    { key: "hidratacao", label: "Água/dia" },
    { key: "recordatorio", label: "Recordatório alimentar" },
    { key: "disponibilidade_alim", label: "Disponibilidade alimentar" },
    { key: "alergias", label: "Alergias / intolerâncias" },
    { key: "rel_comida", label: "Relação com comida" },
    { key: "compulsao_estado", label: "Compulsão alimentar" },
    { key: "compulsao_horario", label: "Horário/gatilho" },
    { key: "fezes", label: "Consistência das fezes" },
    { key: "gastrico", label: "Refluxo / gastrite / azia" },
    { key: "obs_fezes", label: "Obs. intestino" },
  ]},
  { id: "sono", title: "Descanso & recuperação", fields: [
    { key: "tempo_sono", label: "Tempo para dormir" },
    { key: "pico_cansaco", label: "Pico de cansaço" },
    { key: "acorda_descansado", label: "Como acorda?", type: "choices", options: ["Descansado", "Com disposição", "Cansado", "Com dor"] },
    { key: "acorda_noite", label: "Acorda à noite?" },
    { key: "sintomas_noturnos", label: "Sintomas noturnos" },
    { key: "hrv", label: "HRV" },
  ]},
  { id: "neuro", title: "Como você se sente", fields: [
    ...NEURO_SLIDERS.map(s => ({ key: s.key, label: s.label })),
    { key: "obs_neuro", label: "Observações" },
  ]},
  { id: "clinico", title: "Histórico clínico", fields: [
    { key: "exames", label: "Exames recentes" },
    { key: "doencas", label: "Doenças" },
    { key: "familiar", label: "Histórico familiar" },
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

