/**
 * ProtocolEditor.tsx — Editor de protocolos do coach para um aluno.
 * Lista protocolos existentes, permite criar/editar/ativar/desativar.
 * Renderiza preview do HTML em iframe sandboxed.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Save, Trash2, FileText } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ConfirmProvider";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

interface Protocol {
  id: string;
  student_id: string;
  coach_id: string | null;
  title: string;
  html_content: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface Props {
  studentId: string;
  studentName: string;
}

const DEFAULT_TEMPLATE = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<style>
  body { font-family: -apple-system, system-ui, sans-serif; color:#111; max-width: 760px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22px; border-bottom: 2px solid #E11D48; padding-bottom: 6px; }
  h2 { font-size: 16px; color:#E11D48; margin-top: 24px; }
  table { width:100%; border-collapse: collapse; margin: 8px 0 16px; font-size: 13px; }
  th, td { border:1px solid #ddd; padding:6px 8px; text-align:left; }
  th { background:#f5f5f5; }
  .tag { display:inline-block; background:#111; color:#fff; padding:2px 8px; border-radius:999px; font-size:11px; }
</style></head>
<body>
  <h1>Protocolo Personalizado</h1>
  <p><span class="tag">ATIVO</span> · Atualizado em {{DATA}}</p>

  <h2>Dieta</h2>
  <table>
    <tr><th>Refeição</th><th>Itens</th><th>Kcal</th></tr>
    <tr><td>Café</td><td>Ovos + aveia + fruta</td><td>450</td></tr>
  </table>

  <h2>Treino</h2>
  <table>
    <tr><th>Dia</th><th>Foco</th></tr>
    <tr><td>Seg</td><td>Peito + Tríceps</td></tr>
  </table>

  <h2>Observações</h2>
  <p>Mantenha hidratação acima de 3L/dia.</p>
</body></html>`;

export default function ProtocolEditor({ studentId, studentName }: Props) {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [coachId, setCoachId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [html, setHtml] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const previewRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setCoachId(data.session?.user?.id ?? null));
  }, []);

  const { data: protocols = [], isLoading } = useQuery({
    queryKey: ["coach-protocols", studentId],
    enabled: !!studentId,
    queryFn: async () => {
      const { data, error } = await sb
        .from("protocols")
        .select("*")
        .eq("student_id", studentId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data as Protocol[]) ?? [];
    },
  });

  const selected = useMemo(
    () => protocols.find((p) => p.id === selectedId) ?? null,
    [protocols, selectedId]
  );

  useEffect(() => {
    if (selected) {
      setTitle(selected.title);
      setHtml(selected.html_content);
      setActive(selected.active);
    }
  }, [selected]);

  // Preview render
  useEffect(() => {
    const doc = previewRef.current?.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html || "<p style='font-family:sans-serif;color:#888;padding:20px;'>Preview vazio</p>");
    doc.close();
  }, [html]);

  function startNew() {
    setSelectedId(null);
    setTitle(`Protocolo — ${new Date().toLocaleDateString("pt-BR")}`);
    setHtml(DEFAULT_TEMPLATE.replace("{{DATA}}", new Date().toLocaleDateString("pt-BR")));
    setActive(true);
  }

  async function save() {
    if (!title.trim() || !html.trim()) {
      toast.error("Título e conteúdo são obrigatórios");
      return;
    }
    setSaving(true);
    try {
      if (active) {
        // Desativa outros protocolos do aluno se este for ativo
        await sb.from("protocols").update({ active: false }).eq("student_id", studentId);
      }
      if (selected) {
        const { error } = await sb
          .from("protocols")
          .update({ title, html_content: html, active })
          .eq("id", selected.id);
        if (error) throw error;
        toast.success("Protocolo atualizado");
      } else {
        const { data, error } = await sb
          .from("protocols")
          .insert({ student_id: studentId, coach_id: coachId, title, html_content: html, active })
          .select()
          .single();
        if (error) throw error;
        setSelectedId(data.id);
        toast.success("Protocolo criado");
      }
      qc.invalidateQueries({ queryKey: ["coach-protocols", studentId] });
      qc.invalidateQueries({ queryKey: ["protocol", studentId] });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "Excluir protocolo", description: "Excluir este protocolo?", destructive: true, confirmLabel: "Excluir" }))) return;
    const { error } = await sb.from("protocols").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (selectedId === id) { setSelectedId(null); setTitle(""); setHtml(""); }
    qc.invalidateQueries({ queryKey: ["coach-protocols", studentId] });
    qc.invalidateQueries({ queryKey: ["protocol", studentId] });
    toast.success("Protocolo excluído");
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
      {/* Lista lateral */}
      <Card className="bg-card/60 border-border p-3 h-fit">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Protocolos
          </h3>
          <Button size="sm" variant="outline" onClick={startNew} className="h-7 px-2 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Novo
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mb-3 truncate">para {studentName}</p>

        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
          </div>
        ) : protocols.length === 0 ? (
          <div className="text-center py-6">
            <FileText className="w-6 h-6 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-[11px] text-muted-foreground">Sem protocolos</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {protocols.map((p) => (
              <div
                key={p.id}
                className={`group flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                  selectedId === p.id
                    ? "bg-primary/10 border-primary/40"
                    : "border-border hover:bg-accent"
                }`}
                onClick={() => setSelectedId(p.id)}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{p.title}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(p.updated_at).toLocaleDateString("pt-BR")}
                    {p.active && <span className="ml-1.5 text-emerald-500">● ativo</span>}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); remove(p.id); }}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                  title="Excluir"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Editor */}
      <Card className="bg-card/60 border-border p-4">
        {!selected && !title ? (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground mb-4">
              Selecione um protocolo ou crie um novo
            </p>
            <Button onClick={startNew} size="sm">
              <Plus className="w-3.5 h-3.5 mr-1.5" /> Criar protocolo
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <Label className="text-xs">Título</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1 h-9 text-sm"
                />
              </div>
              <div className="flex items-center gap-2 pb-1">
                <Switch checked={active} onCheckedChange={setActive} id="active" />
                <Label htmlFor="active" className="text-xs cursor-pointer">
                  Ativo (exibe ao aluno)
                </Label>
              </div>
            </div>

            <Tabs defaultValue="editor">
              <TabsList className="grid grid-cols-2 w-full sm:w-60">
                <TabsTrigger value="editor">HTML</TabsTrigger>
                <TabsTrigger value="preview">Preview</TabsTrigger>
              </TabsList>

              <TabsContent value="editor" className="mt-3">
                <Textarea
                  value={html}
                  onChange={(e) => setHtml(e.target.value)}
                  spellCheck={false}
                  className="font-mono text-xs h-[460px] resize-none"
                  placeholder="<html>...</html>"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Use HTML completo com estilos inline. Renderizado em iframe sandbox.
                </p>
              </TabsContent>

              <TabsContent value="preview" className="mt-3">
                <iframe
                  ref={previewRef}
                  title="Preview"
                  sandbox="allow-same-origin"
                  className="w-full h-[460px] bg-white rounded-lg border border-border"
                />
              </TabsContent>
            </Tabs>

            <div className="flex justify-end">
              <Button onClick={save} disabled={saving} size="sm">
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : (
                  <Save className="w-3.5 h-3.5 mr-1.5" />
                )}
                {selected ? "Salvar alterações" : "Criar protocolo"}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
