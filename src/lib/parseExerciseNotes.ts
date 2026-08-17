// src/lib/parseExerciseNotes.ts
// Extrai links de vídeo (YouTube / Google Drive / Vimeo) embutidos no meio
// do texto de observação do coach (`exercise.notes`), separando o texto
// "limpo" (sem a URL suja) do link normalizado pronto para embed em <iframe>.

export type VideoProvider = "youtube" | "drive" | "vimeo" | "generic";

export interface ParsedExerciseNotes {
  text: string;
  rawUrl: string | null;
  embedUrl: string | null;
  provider: VideoProvider | null;
}

const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

function trimTrailingPunctuation(url: string): string {
  return url.replace(/[.,;:!?]+$/, "");
}

function toYouTubeEmbed(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/shorts\/|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{6,})/,
  ];
  for (const re of patterns) {
    const m = url.match(re);
    if (m?.[1]) {
      return `https://www.youtube.com/embed/${m[1]}`;
    }
  }
  return null;
}

function toDriveEmbed(url: string): string | null {
  const mFile = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (mFile?.[1]) {
    return `https://drive.google.com/file/d/${mFile[1]}/preview`;
  }
  // Formato alternativo sem o segmento /file/d/ — ex.: .../open?id=ID ou
  // .../uc?id=ID, gerado por alguns fluxos de compartilhamento mobile.
  const mId = url.match(/drive\.google\.com\/(?:open|uc)\?(?:[^#]*&)?id=([a-zA-Z0-9_-]+)/);
  if (mId?.[1]) {
    return `https://drive.google.com/file/d/${mId[1]}/preview`;
  }
  if (/drive\.google\.com\/.*\/preview/.test(url)) return url;
  return null;
}

function toVimeoEmbed(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (m?.[1]) {
    return `https://player.vimeo.com/video/${m[1]}`;
  }
  return null;
}

function resolveEmbed(url: string): { provider: VideoProvider; embedUrl: string } {
  const yt = toYouTubeEmbed(url);
  if (yt) return { provider: "youtube", embedUrl: yt };

  const drive = toDriveEmbed(url);
  if (drive) return { provider: "drive", embedUrl: drive };

  const vimeo = toVimeoEmbed(url);
  if (vimeo) return { provider: "vimeo", embedUrl: vimeo };

  return { provider: "generic", embedUrl: url };
}

export function parseExerciseNotes(raw?: string | null): ParsedExerciseNotes {
  const source = (raw ?? "").trim();
  if (!source) {
    return { text: "", rawUrl: null, embedUrl: null, provider: null };
  }

  const matches = source.match(URL_REGEX);
  if (!matches || matches.length === 0) {
    return { text: source, rawUrl: null, embedUrl: null, provider: null };
  }

  const rawUrl = trimTrailingPunctuation(matches[0]);
  // Remove TODAS as URLs do texto exibido, não só a primeira. O botão de
  // ação só abre a primeira, mas se o coach colar mais de um link nenhuma
  // URL "suja" pode sobrar visível.
  let text = source;
  for (const m of matches) {
    text = text.split(m).join("");
  }
  text = text.replace(/\s{2,}/g, " ").trim();

  const { provider, embedUrl } = resolveEmbed(rawUrl);

  return { text, rawUrl, embedUrl, provider };
}
