/**
 * whatsNew.ts — tipos e funções puras do recurso "Novidades" (avisos de
 * atualização da plataforma para o aluno).
 *
 * Tudo aqui é defensivo de propósito: o conteúdo vem de uma coluna jsonb
 * editável no painel Admin, então um slide malformado nunca pode derrubar o
 * dashboard do aluno — ele só é descartado.
 */
import {
  Sparkles, Heart, Dumbbell, BookOpen, Scale, Utensils, Bell, Flame,
  TrendingUp, Camera, MessageCircle, CalendarDays, Target, Zap,
  type LucideIcon,
} from "lucide-react";

export const MAX_SLIDES_PER_ANNOUNCEMENT = 4;
export const MAX_SLIDE_TITLE = 60;
export const MAX_SLIDE_BODY = 420;
export const MAX_CTA_LABEL = 28;

/** Ícones permitidos nos slides (lista fechada — o jsonb guarda só a chave). */
export const WHATS_NEW_ICONS = {
  sparkles: Sparkles,
  heart: Heart,
  dumbbell: Dumbbell,
  "book-open": BookOpen,
  scale: Scale,
  utensils: Utensils,
  bell: Bell,
  flame: Flame,
  "trending-up": TrendingUp,
  camera: Camera,
  "message-circle": MessageCircle,
  calendar: CalendarDays,
  target: Target,
  zap: Zap,
} as const satisfies Record<string, LucideIcon>;

export type WhatsNewIconKey = keyof typeof WHATS_NEW_ICONS;

export const WHATS_NEW_ICON_LABELS: Record<WhatsNewIconKey, string> = {
  sparkles: "Novidade",
  heart: "Coração (TPM / bem-estar)",
  dumbbell: "Treino",
  "book-open": "Guia / explicação",
  scale: "Peso / balança",
  utensils: "Dieta",
  bell: "Aviso",
  flame: "Intensidade",
  "trending-up": "Evolução",
  camera: "Fotos",
  "message-circle": "Mensagens / chat",
  calendar: "Agenda / semana",
  target: "Meta",
  zap: "Ferramenta nova",
};

export interface WhatsNewCta {
  label: string;
  route: string;
}

export interface WhatsNewSlide {
  icon: string;
  title: string;
  body: string;
  cta?: WhatsNewCta | null;
}

export interface Announcement {
  id: string;
  slug: string;
  title: string;
  audience: "student" | "coach" | "all";
  slides: unknown;
  is_active: boolean;
  published_at: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export function resolveIcon(key: string | undefined | null): LucideIcon {
  if (key && Object.prototype.hasOwnProperty.call(WHATS_NEW_ICONS, key)) {
    return WHATS_NEW_ICONS[key as WhatsNewIconKey];
  }
  return Sparkles;
}

/**
 * Só aceita rota interna do app: começa com "/", sem "//" (URL relativa a
 * protocolo), sem barra invertida e sem caracteres de controle. Qualquer
 * outra coisa (http:, javascript:, etc.) vira null e o botão não aparece.
 */
export function sanitizeRoute(route: string | null | undefined): string | null {
  if (typeof route !== "string") return null;
  const r = route.trim();
  if (!r.startsWith("/") || r.startsWith("//") || r.includes("\\")) return null;
  for (let i = 0; i < r.length; i++) {
    if (r.charCodeAt(i) < 32) return null;
  }
  return r;
}

function asNonEmptyString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.slice(0, max);
}

/** Converte o jsonb cru em slides válidos (descarta os malformados). */
export function normalizeSlides(raw: unknown): WhatsNewSlide[] {
  if (!Array.isArray(raw)) return [];
  const out: WhatsNewSlide[] = [];
  for (const item of raw) {
    if (out.length >= MAX_SLIDES_PER_ANNOUNCEMENT) break;
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    const title = asNonEmptyString(s.title, MAX_SLIDE_TITLE);
    const body = asNonEmptyString(s.body, MAX_SLIDE_BODY);
    if (!title || !body) continue;

    let cta: WhatsNewCta | null = null;
    if (s.cta && typeof s.cta === "object") {
      const c = s.cta as Record<string, unknown>;
      const label = asNonEmptyString(c.label, MAX_CTA_LABEL);
      const route = sanitizeRoute(typeof c.route === "string" ? c.route : null);
      if (label && route) cta = { label, route };
    }

    out.push({
      icon: typeof s.icon === "string" ? s.icon : "sparkles",
      title,
      body,
      cta,
    });
  }
  return out;
}

/**
 * Junta os avisos pendentes numa única sequência de slides. `ids` inclui TODOS
 * os avisos recebidos (inclusive os sem slide válido), para que sejam marcados
 * como vistos e não fiquem reaparecendo vazios.
 */
export function flattenAnnouncements(list: Announcement[]): { slides: WhatsNewSlide[]; ids: string[] } {
  const slides: WhatsNewSlide[] = [];
  const ids: string[] = [];
  for (const a of list) {
    ids.push(a.id);
    slides.push(...normalizeSlides(a.slides));
  }
  return { slides, ids };
}

/** Gera um slug a partir do título (a-z, 0-9 e hífen). */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export interface AnnouncementFormInput {
  title: string;
  slug: string;
  slides: { title: string; body: string; ctaLabel: string; ctaRoute: string }[];
}

/** Valida o formulário do Admin; devolve a mensagem do primeiro erro ou null. */
export function validateAnnouncementForm(f: AnnouncementFormInput): string | null {
  if (!f.title.trim()) return "Dê um título interno ao aviso.";
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.slug) || f.slug.length > 80) {
    return "Identificador inválido (use letras minúsculas, números e hífen).";
  }
  if (f.slides.length < 1 || f.slides.length > MAX_SLIDES_PER_ANNOUNCEMENT) {
    return `Use de 1 a ${MAX_SLIDES_PER_ANNOUNCEMENT} slides.`;
  }
  for (let i = 0; i < f.slides.length; i++) {
    const s = f.slides[i];
    const n = i + 1;
    if (!s.title.trim()) return `Slide ${n}: falta o título.`;
    if (!s.body.trim()) return `Slide ${n}: falta o texto "para que serve".`;
    const hasLabel = s.ctaLabel.trim() !== "";
    const hasRoute = s.ctaRoute.trim() !== "";
    if (hasLabel !== hasRoute) return `Slide ${n}: preencha o texto E a rota do botão (ou deixe os dois vazios).`;
    if (hasRoute && !sanitizeRoute(s.ctaRoute)) {
      return `Slide ${n}: a rota do botão deve começar com "/" (ex.: /workout-plan).`;
    }
  }
  return null;
}
