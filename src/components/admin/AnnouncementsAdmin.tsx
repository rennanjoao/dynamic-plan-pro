// src/components/admin/AnnouncementsAdmin.tsx
// Admin > Novidades: cria, edita, publica e pré-visualiza os avisos de
// atualização que os alunos veem uma vez no primeiro acesso após a publicação.
//
// Só admin escreve (RLS: has_role admin). Publicar = ligar "is_active"; o
// trigger do banco carimba published_at = agora, que define QUEM verá o aviso
// (quem já tinha feito o primeiro acesso antes desse momento).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { sb } from "@/integrations/supabase/untyped";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { WhatsNewDialog } from "@/components/student/WhatsNewDialog";
import { formatDatePtBR } from "@/lib/formatDate";
import {
  MAX_CTA_LABEL, MAX_SLIDE_BODY, MAX_SLIDE_TITLE, MAX_SLIDES_PER_ANNOUNCEMENT,
  WHATS_NEW_ICON_LABELS, normalizeSlides, slugify, validateAnnouncementForm,
  type Announcement, type WhatsNewIconKey, type WhatsNewSlide,
} from "@/lib/whatsNew";

interface SlideForm {
  icon: string;
  title: string;
  body: string;
  ctaLabel: string;
  ctaRoute: string;
}

interface FormState {
  id: string | null;
  title: string;
  slug: string;
  slugTouched: boolean;
  audience: "student" | "all";
  expires: string; // yyyy-mm-dd ou ""
  publish: boolean;
  slides: SlideForm[];
}

type DbError = Error & { code?: string };

const emptySlide = (): SlideForm => ({ icon: "sparkles", title: "", body: "", ctaLabel: "", ctaRoute: "" });
const emptyForm = (): FormState => ({
  id: null, title: "", slug: "", slugTouched: false, audience: "student", expires: "", publish: false, slides: [emptySlide()],
});

function toForm(a: Announcement): FormState {
  const slides = normalizeSlides(a.slides).map<SlideForm>((s) => ({
    icon: s.icon, title: s.title, body: s.body, ctaLabel: s.cta?.label ?? "", ctaRoute: s.cta?.route ?? "",
  }));
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    slugTouched: true,
    audience: a.audience === "all" ? "all" : "student",
    expires: a.expires_at ? a.expires_at.slice(0, 10) : "",
    publish: a.is_active,
    slides: slides.length ? slides : [emptySlide()],
  };
}

function toSlides(f: FormState): WhatsNewSlide[] {
  return f.slides.map((s) => ({
    icon: s.icon,
    title: s.title.trim(),
    body: s.body.trim(),
    cta: s.ctaLabel.trim() && s.ctaRoute.trim() ? { label: s.ctaLabel.trim(), route: s.ctaRoute.trim() } : null,
  }));
}

function statusOf(a: Announcement): { label: string; variant: "success" | "secondary" | "outline" } {
  if (a.expires_at && new Date(a.expires_at) <= new Date()) return { label: "Expirado", variant: "outline" };
  return a.is_active ? { label: "Publicado", variant: "success" } : { label: "Rascunho", variant: "secondary" };
}

export function AnnouncementsAdmin() {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState | null>(null);
  const [preview, setPreview] = useState<WhatsNewSlide[] | null>(null);

  const list = useQuery({
    queryKey: ["admin", "announcements"],
    queryFn: async (): Promise<Announcement[]> => {
      const { data, error } = await sb.from("app_announcements").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });

  const reach = useQuery({
    queryKey: ["admin", "announcement-views"],
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await sb.from("announcement_views").select("announcement_id").limit(10000);
      if (error) throw error;
      const out: Record<string, number> = {};
      for (const r of (data ?? []) as { announcement_id: string }[]) out[r.announcement_id] = (out[r.announcement_id] ?? 0) + 1;
      return out;
    },
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["admin", "announcements"] });
    void qc.invalidateQueries({ queryKey: ["admin", "announcement-views"] });
  };

  const save = useMutation({
    mutationFn: async (f: FormState) => {
      const payload = {
        title: f.title.trim(),
        slug: f.slug,
        audience: f.audience,
        slides: toSlides(f),
        is_active: f.publish,
        expires_at: f.expires ? new Date(`${f.expires}T23:59:59`).toISOString() : null,
      };
      const { error } = f.id
        ? await sb.from("app_announcements").update(payload).eq("id", f.id)
        : await sb.from("app_announcements").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Novidade salva.");
      setForm(null);
      refresh();
    },
    onError: (e: DbError) =>
      toast.error(e?.code === "23505" ? "Já existe um aviso com esse identificador." : `Não foi possível salvar: ${e?.message ?? "erro"}`),
  });

  const togglePublish = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await sb.from("app_announcements").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: refresh,
    onError: (e: DbError) => toast.error(`Não foi possível alterar: ${e?.message ?? "erro"}`),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("app_announcements").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Aviso excluído.");
      refresh();
    },
    onError: (e: DbError) => toast.error(`Não foi possível excluir: ${e?.message ?? "erro"}`),
  });

  const patchSlide = (i: number, patch: Partial<SlideForm>) =>
    setForm((f) => (f ? { ...f, slides: f.slides.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) } : f));

  const moveSlide = (i: number, dir: -1 | 1) =>
    setForm((f) => {
      if (!f) return f;
      const j = i + dir;
      if (j < 0 || j >= f.slides.length) return f;
      const slides = [...f.slides];
      [slides[i], slides[j]] = [slides[j], slides[i]];
      return { ...f, slides };
    });

  const submit = () => {
    if (!form) return;
    const err = validateAnnouncementForm(form);
    if (err) {
      toast.error(err);
      return;
    }
    save.mutate(form);
  };

  const items = list.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="space-y-1 max-w-xl">
          <h2 className="text-lg font-semibold">Novidades para os alunos</h2>
          <p className="text-xs text-muted-foreground">
            Avisos curtos que o aluno vê uma única vez. Ao publicar, só quem já fez o primeiro acesso antes desse momento
            recebe o aviso; aluno novo vê o onboarding. Cada aviso fica no histórico "Novidades do app".
          </p>
        </div>
        <Button onClick={() => setForm(emptyForm())} className="gap-1.5">
          <Plus className="w-4 h-4" /> Nova novidade
        </Button>
      </div>

      {list.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {list.isError && (
        <p className="text-sm text-destructive">Não foi possível carregar. A migração das novidades já foi aplicada?</p>
      )}
      {!list.isLoading && !list.isError && items.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma novidade criada ainda.</p>
      )}

      <div className="space-y-3">
        {items.map((a) => {
          const st = statusOf(a);
          const slides = normalizeSlides(a.slides);
          return (
            <Card key={a.id}>
              <CardContent className="p-4 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px] space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{a.title}</span>
                    <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    {slides.length} slide{slides.length === 1 ? "" : "s"} · {a.is_active ? `publicado em ${formatDatePtBR(a.published_at)}` : "não publicado"}
                    {a.expires_at ? ` · expira em ${formatDatePtBR(a.expires_at)}` : ""}
                    {a.is_active ? ` · ${reach.data?.[a.id] ?? 0} aluno(s) viram` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Publicado
                    <Switch
                      checked={a.is_active}
                      disabled={togglePublish.isPending}
                      onCheckedChange={(v) => togglePublish.mutate({ id: a.id, active: v })}
                      aria-label={`Publicar ${a.title}`}
                    />
                  </label>
                  <Button size="icon" variant="ghost" aria-label="Pré-visualizar" onClick={() => setPreview(slides)} disabled={slides.length === 0}>
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Editar" onClick={() => setForm(toForm(a))}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Excluir"
                    onClick={() => {
                      if (window.confirm(`Excluir "${a.title}"? Isso também remove o registro de quem já viu.`)) remove.mutate(a.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pré-visualização (nunca grava "visto") */}
      <WhatsNewDialog
        open={preview !== null}
        onOpenChange={(o) => !o && setPreview(null)}
        slides={preview ?? []}
        onNavigate={(route) => toast.info(`No app do aluno este botão leva a: ${route}`)}
      />

      {/* Formulário */}
      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90dvh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Editar novidade" : "Nova novidade"}</DialogTitle>
            <DialogDescription>Escreva em linguagem simples: o que mudou e para que serve.</DialogDescription>
          </DialogHeader>

          {form && (
            <div className="overflow-y-auto min-h-0 space-y-4 pr-1">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="ann-title">Título interno (aparece no histórico)</Label>
                  <Input
                    id="ann-title"
                    value={form.title}
                    maxLength={120}
                    onChange={(e) =>
                      setForm({ ...form, title: e.target.value, slug: form.slugTouched ? form.slug : slugify(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ann-slug">Identificador</Label>
                  <Input
                    id="ann-slug"
                    value={form.slug}
                    maxLength={80}
                    disabled={!!form.id}
                    onChange={(e) => setForm({ ...form, slug: slugify(e.target.value), slugTouched: true })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Quem vê</Label>
                  <Select value={form.audience} onValueChange={(v) => setForm({ ...form, audience: v as "student" | "all" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Alunos</SelectItem>
                      <SelectItem value="all">Todos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ann-expires">Expira em (opcional)</Label>
                  <Input id="ann-expires" type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm sm:self-end sm:pb-2">
                  <Switch checked={form.publish} onCheckedChange={(v) => setForm({ ...form, publish: v })} />
                  Publicar para os alunos ao salvar
                </label>
              </div>

              <div className="space-y-3">
                {form.slides.map((s, i) => (
                  <Card key={i}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">Slide {i + 1}</span>
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="ghost" aria-label="Subir slide" disabled={i === 0} onClick={() => moveSlide(i, -1)}>
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" aria-label="Descer slide" disabled={i === form.slides.length - 1} onClick={() => moveSlide(i, 1)}>
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Remover slide"
                            disabled={form.slides.length === 1}
                            onClick={() => setForm({ ...form, slides: form.slides.filter((_, idx) => idx !== i) })}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                        <div className="space-y-1.5">
                          <Label>Ícone</Label>
                          <Select value={s.icon} onValueChange={(v) => patchSlide(i, { icon: v })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.keys(WHATS_NEW_ICON_LABELS) as WhatsNewIconKey[]).map((k) => (
                                <SelectItem key={k} value={k}>{WHATS_NEW_ICON_LABELS[k]}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Título do slide</Label>
                          <Input value={s.title} maxLength={MAX_SLIDE_TITLE} onChange={(e) => patchSlide(i, { title: e.target.value })} />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Para que serve (texto do slide)</Label>
                        <Textarea value={s.body} rows={4} maxLength={MAX_SLIDE_BODY} onChange={(e) => patchSlide(i, { body: e.target.value })} />
                        <p className="text-[10px] text-muted-foreground text-right">{s.body.length}/{MAX_SLIDE_BODY}</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label>Botão (opcional) — texto</Label>
                          <Input value={s.ctaLabel} maxLength={MAX_CTA_LABEL} placeholder="Ver agora" onChange={(e) => patchSlide(i, { ctaLabel: e.target.value })} />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Botão — rota no app</Label>
                          <Input value={s.ctaRoute} placeholder="/workout-plan" onChange={(e) => patchSlide(i, { ctaRoute: e.target.value })} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {form.slides.length < MAX_SLIDES_PER_ANNOUNCEMENT && (
                  <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={() => setForm({ ...form, slides: [...form.slides, emptySlide()] })}>
                    <Plus className="w-4 h-4" /> Adicionar slide
                  </Button>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Rotas úteis: /student-area, /workout-plan, /routine (dieta), /supplements, /evolution, /check-in. Para destacar um item, acrescente
                  ?highlight=id (ex.: /routine?highlight=tool-tpm).
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 shrink-0">
            <Button variant="ghost" onClick={() => setForm(null)}>Cancelar</Button>
            <Button
              variant="outline"
              onClick={() => form && setPreview(toSlides(form).filter((s) => s.title && s.body))}
              disabled={!form}
            >
              Pré-visualizar
            </Button>
            <Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Salvando…" : "Salvar"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AnnouncementsAdmin;
