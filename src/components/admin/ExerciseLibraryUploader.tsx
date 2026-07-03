
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { EXERCISE_GIFS_BUCKET } from "@/lib/exerciseLibrary";

export function ExerciseLibraryUploader() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = Array.from(e.target.files ?? []).filter((f) =>
      f.name.toLowerCase().endsWith(".webp")
    );
    setFiles(list);
    setDone(0);
    setFailed([]);
  };

  const handleUpload = async () => {
    setUploading(true);
    setDone(0);
    const errs: string[] = [];

    for (const file of files) {
      const { error } = await supabase.storage
        .from(EXERCISE_GIFS_BUCKET)
        .upload(file.name, file, { upsert: true, contentType: "image/webp" });
      if (error) errs.push(`${file.name}: ${error.message}`);
      setDone((d) => d + 1);
    }

    setFailed(errs);
    setUploading(false);
    toast.success(`Upload concluído: ${files.length - errs.length}/${files.length} arquivos.`);
  };

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <p className="text-sm text-muted-foreground mb-2">
          Selecione todos os .webp da biblioteca local (Ctrl+A dentro da pasta no seletor de
          arquivos) e clique em enviar. Os nomes têm que ser idênticos aos já cadastrados na
          tabela <code>exercise_library</code>.
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
