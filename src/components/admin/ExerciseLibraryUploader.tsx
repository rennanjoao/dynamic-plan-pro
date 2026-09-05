import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sb } from "@/integrations/supabase/untyped";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { EXERCISE_GIFS_BUCKET, invalidateExerciseLibraryCache } from "@/lib/exerciseLibrary";
import { toExerciseKey } from "@/lib/workoutTypes";
import { classifyExerciseByName } from "@/lib/muscleGroupClassifier";

/**
 * O Supabase Storage rejeita chaves de objeto com acentos, parênteses e
 * outros caracteres fora de [a-zA-Z0-9._-] (erro "Invalid key"). Os arquivos
 * da biblioteca vêm com nomes em português (ex.: "Alongamento de ombro
 * reverso em pé.webp"), então precisamos gerar uma chave "limpa" só para o
 * caminho de storage — o nome original continua preservado como file_name
 * na tabela exercise_library, e a busca do gif usa a exercise_key (que já
 * remove acentos via toExerciseKey), então nada quebra na hora de exibir.
 */
function sanitizeStorageKey(fileName: string): string {
  const dotIdx = fileName.lastIndexOf(".");
  const base = dotIdx >= 0 ? fileName.slice(0, dotIdx) : fileName;
  const ext  = dotIdx >= 0 ? fileName.slice(dotIdx + 1) : "webp";

  const cleanBase = base
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // remove acentos
    .replace(/[()]/g, "")              // remove parênteses
    .replace(/\s+/g, "_")              // espaços -> "_"
    .replace(/[^a-zA-Z0-9._-]/g, "");  // remove qualquer outro caractere inválido

  return `${cleanBase}.${ext.toLowerCase()}`;
}

export function ExerciseLibraryUploader() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [summary, setSummary] = useState<string | null>(null);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []).filter((f) =>
      f.name.toLowerCase().endsWith(".webp")
    );
    setFiles(list);
    setDone(0);
    setFailed([]);
    setSummary(null);
  };

  const handleUpload = async () => {
    setUploading(true);
    setDone(0);
    setSummary(null);
    const errs: string[] = [];

    try {
      for (const file of files) {
        try {
          const storageKey = sanitizeStorageKey(file.name);

          let uploadError: { message: string } | null = null;
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const { error } = await supabase.storage
                .from(EXERCISE_GIFS_BUCKET)
                .upload(storageKey, file, { upsert: true, contentType: "image/webp" });
              uploadError = error;
              if (!error) break;
            } catch (err) {
              // Falha de rede/gateway que nem chega a virar um { error } normal
              // (ex.: resposta HTML em vez de JSON) — trata como erro do arquivo
              // e tenta de novo antes de desistir.
              uploadError = { message: err instanceof Error ? err.message : "Erro de rede desconhecido" };
            }
          }

          if (uploadError) {
            errs.push(`${file.name}: ${uploadError.message}`);
            continue;
          }

          // Registra/atualiza a entrada na biblioteca para que o app já ache o
          // gif pela chave normalizada do exercício (mesmo cálculo usado em toda
          // a parte de treino: nome em minúsculas, sem acento, com "_"). O
          // file_name salvo aqui é o mesmo usado como caminho no storage.
          const baseName = file.name.replace(/\.webp$/i, "");
          const exerciseKey = toExerciseKey(baseName);
          try {
            // 1) Grava só file_name/display_name — nunca mexe em classificação de
            // grupo muscular aqui. Se fizesse upsert com os campos de classificação
            // juntos, um re-upload de gif podia sobrescrever uma classificação
            // "manual" que o coach já tivesse definido pelo picker.
            const { error: libError } = await sb
              .from("exercise_library")
              .upsert(
                {
                  exercise_key: exerciseKey,
                  file_name: storageKey,
                  display_name: baseName,
                  updated_at: new Date().toISOString(),
                },
                { onConflict: "exercise_key" }
              );
            if (libError) {
              errs.push(`${file.name}: enviado, mas falhou ao registrar na biblioteca (${libError.message})`);
            } else {
              // 2) Classificação automática pelo nome do arquivo, via RPC — que
              // respeita a prioridade manual > auto > unclassified e não derruba
              // uma classificação manual já existente.
              const classification = classifyExerciseByName(baseName);
              if (classification.confidence === "auto" && classification.primary) {
                const { error: classError } = await sb.rpc("classify_exercise_library_entry", {
                  p_exercise_key: exerciseKey,
                  p_display_name: baseName,
                  p_primary_group: classification.primary,
                  p_secondary_groups: classification.secondary,
                  p_source: "auto",
                });
                if (classError) {
                  errs.push(`${file.name}: gif enviado, mas falhou classificação automática (${classError.message})`);
                }
              }
            }
          } catch (err) {
            errs.push(
              `${file.name}: enviado, mas falhou ao registrar na biblioteca (${
                err instanceof Error ? err.message : "erro desconhecido"
              })`
            );
          }
        } catch (err) {
          // Qualquer outro erro inesperado nesse arquivo não pode derrubar o
          // envio dos demais.
          errs.push(`${file.name}: erro inesperado (${err instanceof Error ? err.message : "desconhecido"})`);
        } finally {
          setDone((d) => d + 1);
        }
      }
    } finally {
      // Roda sempre, mesmo se algo escapar dos try/catch acima — garante que
      // a tela nunca fica travada em "Enviando..." sem explicação.
      // Invalida o cache da biblioteca para que buscas/matches nesta mesma aba
      // já enxerguem os gifs recém-enviados, sem precisar dar F5 na página.
      invalidateExerciseLibraryCache();
      setFailed(errs);
      setUploading(false);
      const okCount = files.length - errs.length;
      const summaryText =
        errs.length === 0
          ? `Upload concluído: ${okCount}/${files.length} arquivos, sem erros.`
          : `Upload concluído: ${okCount}/${files.length} arquivos ok, ${errs.length} falharam.`;
      setSummary(summaryText);
      if (errs.length === 0) {
        toast.success(summaryText);
      } else {
        toast.error(summaryText);
      }
    }
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <p className="text-sm text-muted-foreground mb-2">
          Selecione todos os .webp da biblioteca local (Ctrl+A dentro da pasta no seletor de
          arquivos) e clique em enviar. O nome do arquivo (sem o .webp) deve ser igual ao nome
          do exercício usado nos treinos — a chave de busca é gerada automaticamente a partir
          dele e cadastrada na tabela <code>exercise_library</code> junto com o upload.
        </p>
        <input
          type="file"
          accept=".webp"
          multiple
          onChange={handleSelect}
          className="block text-sm"
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm">{files.length} arquivos selecionados.</p>
          <Button onClick={handleUpload} disabled={uploading}>
            {uploading ? `Enviando... ${done}/${files.length}` : `Enviar ${files.length} arquivos`}
          </Button>
          {uploading && <Progress value={(done / files.length) * 100} />}
        </div>
      )}

      {summary && !uploading && (
        <p className="text-sm font-semibold">{summary}</p>
      )}

      {failed.length > 0 && (
        <div className="text-sm text-destructive space-y-1">
          <p className="font-semibold">Falharam ({failed.length}):</p>
          {failed.map((f) => (
            <p key={f}>{f}</p>
          ))}
        </div>
      )}
    </div>
  );
}
