/**
 * studentMedia.ts
 * Upload e leitura de mídia sensível do aluno (fotos de progresso e exames)
 * no bucket PRIVADO `student-media` do backend.
 *
 * Regras:
 *  - O que fica salvo no payload é o *caminho* no bucket (`<studentId>/fotos/xxx.jpg`),
 *    nunca uma URL pública.
 *  - A leitura sempre passa por URL assinada de curta duração (10 min), gerada
 *    sob a sessão do usuário — o RLS do bucket decide se ele pode ver.
 *  - URLs legadas (Cloudinary, `http...`) continuam funcionando como estão.
 */
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const STUDENT_MEDIA_BUCKET = "student-media";
const SIGNED_TTL_SECONDS = 600;
const CACHE_MARGIN_MS = 60_000;

/** `true` quando o valor é um caminho do bucket privado (e não URL legada/data/blob). */
export function isStoragePath(value?: string | null): boolean {
  if (!value) return false;
  return !/^(https?:|data:|blob:)/i.test(value);
}

function safeName(name: string) {
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || "bin").toLowerCase();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
}

async function upload(studentId: string, folder: "fotos" | "exames", file: File): Promise<string> {
  if (!studentId) throw new Error("studentId ausente para upload");
  const path = `${studentId}/${folder}/${safeName(file.name)}`;
  const { error } = await supabase.storage
    .from(STUDENT_MEDIA_BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (error) throw error;
  return path;
}

/** Envia uma foto de progresso. Retorna o caminho no bucket privado. */
export function uploadStudentPhoto(studentId: string, file: File) {
  return upload(studentId, "fotos", file);
}

/** Envia um exame (PDF). Retorna o caminho no bucket privado. */
export function uploadStudentExam(studentId: string, file: File) {
  return upload(studentId, "exames", file);
}

const signedCache = new Map<string, { url: string; expiresAt: number }>();

/** Gera (com cache) a URL assinada de um caminho. Valores legados voltam intactos. */
export async function resolveMediaUrl(value?: string | null): Promise<string> {
  if (!value) return "";
  if (!isStoragePath(value)) return value;
  const cached = signedCache.get(value);
  if (cached && cached.expiresAt > Date.now() + CACHE_MARGIN_MS) return cached.url;
  const { data, error } = await supabase.storage
    .from(STUDENT_MEDIA_BUCKET)
    .createSignedUrl(value, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) return "";
  signedCache.set(value, {
    url: data.signedUrl,
    expiresAt: Date.now() + SIGNED_TTL_SECONDS * 1000,
  });
  return data.signedUrl;
}

/** Resolve vários caminhos de uma vez (exportações, PDF). */
export async function resolveMediaUrls(values: Array<string | null | undefined>): Promise<string[]> {
  return Promise.all(values.map((v) => resolveMediaUrl(v)));
}

/** Hook: devolve a URL pronta para `<img src>` / `<a href>`. */
export function useMediaUrl(value?: string | null): string {
  const [url, setUrl] = useState<string>(() => (isStoragePath(value) ? "" : value || ""));
  useEffect(() => {
    let cancelled = false;
    if (!value) { setUrl(""); return; }
    if (!isStoragePath(value)) { setUrl(value); return; }
    setUrl("");
    resolveMediaUrl(value).then((u) => { if (!cancelled) setUrl(u); });
    return () => { cancelled = true; };
  }, [value]);
  return url;
}

/** Abre uma mídia privada numa nova aba, resolvendo a URL assinada antes. */
export async function openMedia(value?: string | null) {
  const url = await resolveMediaUrl(value);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}
