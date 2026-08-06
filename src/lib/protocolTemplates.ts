// src/lib/protocolTemplates.ts
// Ponto único de gravação de templates de protocolo.
//
// Antes existiam duas implementações (ProtocolBuilder.saveAsTemplate e
// TemplateLibraryDialog.saveProtocolTemplate) com semânticas divergentes de
// `student_id`: uma gravava o aluno real que estava sendo editado, a outra o
// próprio coach como sentinela. A semântica correta é a segunda — template não
// tem aluno alvo, ele mora na conta do coach. Manter as duas separadas era o
// que permitia a divergência voltar; por isso ambas chamam esta função.

import { supabase } from "@/integrations/supabase/client";
import { ProtocolPayloadSchema } from "@/lib/protocolSchema";

export async function saveProtocolAsTemplate(
  coachId: string,
  name: string,
  payload: unknown
): Promise<void> {
  if (!coachId) throw new Error("Coach não identificado");
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Dê um nome ao template");

  const parsed = ProtocolPayloadSchema.parse(payload);

  const { error } = await supabase.from("protocols").insert({
    coach_id: coachId,
    student_id: coachId, // templates ficam na conta do coach (sem aluno alvo)
    name: trimmed,
    is_template: true,
    payload: parsed,
    active: false,
  });
  if (error) throw error;
}
