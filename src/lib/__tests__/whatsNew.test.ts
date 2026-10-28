/**
 * whatsNew.test.ts — lógica pura do recurso "Novidades".
 * O foco é a defesa: conteúdo vem de jsonb editável, então nada malformado
 * pode quebrar o dashboard nem abrir link externo.
 */
import { describe, it, expect } from "vitest";
import {
  flattenAnnouncements, normalizeSlides, resolveIcon, sanitizeRoute, slugify,
  validateAnnouncementForm, MAX_SLIDES_PER_ANNOUNCEMENT, WHATS_NEW_ICONS,
  type Announcement,
} from "../whatsNew";

const ann = (id: string, slides: unknown): Announcement => ({
  id, slug: id, title: id, audience: "student", slides, is_active: true,
  published_at: "2026-10-27T12:00:00Z", expires_at: null,
  created_at: "2026-10-27T12:00:00Z", updated_at: "2026-10-27T12:00:00Z",
});

describe("sanitizeRoute", () => {
  it("aceita rotas internas (com query)", () => {
    expect(sanitizeRoute("/workout-plan")).toBe("/workout-plan");
    expect(sanitizeRoute("  /routine?highlight=tool-tpm ")).toBe("/routine?highlight=tool-tpm");
  });
  it.each([
    "https://evil.com", "http://evil.com", "//evil.com", "javascript:alert(1)",
    "workout-plan", "/\\evil.com", "/ok\u0000bad", "", "   ",
  ])("rejeita %j", (bad) => {
    expect(sanitizeRoute(bad)).toBeNull();
  });
  it("rejeita não-string", () => {
    expect(sanitizeRoute(undefined)).toBeNull();
    expect(sanitizeRoute(null)).toBeNull();
    expect(sanitizeRoute(42 as unknown as string)).toBeNull();
  });
});

describe("normalizeSlides", () => {
  it("devolve [] para qualquer coisa que não seja array", () => {
    expect(normalizeSlides(null)).toEqual([]);
    expect(normalizeSlides({})).toEqual([]);
    expect(normalizeSlides("x")).toEqual([]);
  });
  it("descarta slides sem título/texto e itens que não são objeto", () => {
    const out = normalizeSlides([
      { icon: "heart", title: "A", body: "corpo" },
      { icon: "heart", title: "", body: "sem título" },
      { icon: "heart", title: "sem corpo", body: "  " },
      null, 7, "texto",
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe("A");
  });
  it("limita ao máximo de slides por aviso", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ icon: "zap", title: `T${i}`, body: "b" }));
    expect(normalizeSlides(many)).toHaveLength(MAX_SLIDES_PER_ANNOUNCEMENT);
  });
  it("mantém cta válido e zera cta com rota externa ou incompleto", () => {
    const [ok, ext, half] = normalizeSlides([
      { title: "1", body: "b", cta: { label: "Ver", route: "/workout-plan" } },
      { title: "2", body: "b", cta: { label: "Ver", route: "https://evil.com" } },
      { title: "3", body: "b", cta: { label: "", route: "/x" } },
    ]);
    expect(ok.cta).toEqual({ label: "Ver", route: "/workout-plan" });
    expect(ext.cta).toBeNull();
    expect(half.cta).toBeNull();
  });
  it("ícone ausente vira sparkles", () => {
    expect(normalizeSlides([{ title: "t", body: "b" }])[0].icon).toBe("sparkles");
  });
});

describe("resolveIcon", () => {
  it("resolve chaves conhecidas e cai em sparkles nas desconhecidas", () => {
    expect(resolveIcon("dumbbell")).toBe(WHATS_NEW_ICONS.dumbbell);
    expect(resolveIcon("nao-existe")).toBe(WHATS_NEW_ICONS.sparkles);
    expect(resolveIcon("toString")).toBe(WHATS_NEW_ICONS.sparkles); // sem herança do protótipo
    expect(resolveIcon(undefined)).toBe(WHATS_NEW_ICONS.sparkles);
  });
});

describe("flattenAnnouncements", () => {
  it("concatena os slides na ordem e devolve TODOS os ids (inclusive aviso sem slide válido)", () => {
    const { slides, ids } = flattenAnnouncements([
      ann("a", [{ title: "A1", body: "b" }, { title: "A2", body: "b" }]),
      ann("quebrado", [{ title: "", body: "" }]),
      ann("b", [{ title: "B1", body: "b" }]),
    ]);
    expect(slides.map((s) => s.title)).toEqual(["A1", "A2", "B1"]);
    expect(ids).toEqual(["a", "quebrado", "b"]);
  });
});

describe("slugify", () => {
  it("remove acento, espaço e símbolos", () => {
    expect(slugify("S.O.S TPM — Novo visual!")).toBe("s-o-s-tpm-novo-visual");
    expect(slugify("  Gravação de Pesos  ")).toBe("gravacao-de-pesos");
  });
  it("respeita 80 caracteres sem terminar em hífen", () => {
    const s = slugify("a ".repeat(100));
    expect(s.length).toBeLessThanOrEqual(80);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("validateAnnouncementForm", () => {
  const slide = { title: "T", body: "B", ctaLabel: "", ctaRoute: "" };
  const base = { title: "Aviso", slug: "aviso", slides: [slide] };
  it("aceita formulário válido", () => {
    expect(validateAnnouncementForm(base)).toBeNull();
    expect(validateAnnouncementForm({ ...base, slides: [{ ...slide, ctaLabel: "Ver", ctaRoute: "/workout-plan" }] })).toBeNull();
  });
  it("barra título vazio, slug inválido e slides fora do limite", () => {
    expect(validateAnnouncementForm({ ...base, title: " " })).toMatch(/título/i);
    expect(validateAnnouncementForm({ ...base, slug: "Com Espaço" })).toMatch(/identificador/i);
    expect(validateAnnouncementForm({ ...base, slides: [] })).toMatch(/slides/i);
    expect(validateAnnouncementForm({ ...base, slides: Array(5).fill(slide) })).toMatch(/slides/i);
  });
  it("exige texto E rota no botão, e rota interna", () => {
    expect(validateAnnouncementForm({ ...base, slides: [{ ...slide, ctaLabel: "Ver" }] })).toMatch(/Slide 1/);
    expect(validateAnnouncementForm({ ...base, slides: [{ ...slide, ctaLabel: "Ver", ctaRoute: "https://x.com" }] })).toMatch(/começar com "\/"/);
  });
});
