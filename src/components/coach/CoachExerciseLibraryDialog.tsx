import { useEffect, useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Search, Mail, CheckCircle2 } from "lucide-react";
import { listAllLibraryExercises } from "@/lib/exerciseLibrary";
import { toExerciseKey } from "@/lib/workoutTypes";
import { cn } from "@/lib/utils";

export interface LibraryPickItem {
  key: string;
  displayName: string;
  url: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Chamado com os itens selecionados ao confirmar. O diálogo se fecha e limpa a seleção sozinho. */
  onConfirm: (items: LibraryPickItem[]) => void;
  /** gifKeys já presentes no bloco de treino atual — só para indicação visual, não bloqueia reseleção. */
  existingKeys?: string[];
  /** Rótulo do bloco de treino (ex.: "Treino A"), usado no título para dar contexto. */
  dayLabel?: string;
}

const ADMIN_REPORT_EMAIL = "admin@eliteprimehub.com.br";

export function CoachExerciseLibraryDialog({
  open, onOpenChange, onConfirm, existingKeys, dayLabel,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [all, setAll] = useState<LibraryPickItem[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Map<string, LibraryPickItem>>(new Map());

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoading(true);
    listAllLibraryExercises()
      .then((items) => { if (alive) setAll(items); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open]);

  // Reseta busca e seleção sempre que o diálogo é reaberto — evita carregar
  // seleção de uma sessão anterior de forma confusa.
  useEffect(() => {
    if (open) { setQuery(""); setSelected(new Map()); }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return all;
    const needle = toExerciseKey(q);
    return all.filter((item) => toExerciseKey(item.displayName).includes(needle) || toExerciseKey(item.key).includes(needle));
  }, [all, query]);

  const existingSet = useMemo(() => new Set(existingKeys ?? []), [existingKeys]);

  const toggle = (item: LibraryPickItem) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(item.key)) next.delete(item.key);
      else next.set(item.key, item);
      return next;
    });
  };

  const handleConfirm = () => {
    if (selected.size === 0) return;
    onConfirm([...selected.values()]);
    onOpenChange(false);
  };

  const mailtoHref = `mailto:${ADMIN_REPORT_EMAIL}?subject=${encodeURIComponent(
    "Exercício faltando na biblioteca",
  )}&body=${encodeURIComponent(
    `Olá! Não encontrei o seguinte exercício na biblioteca:\n\nNome sugerido: ${query || "(descreva aqui)"}\n\nObrigado!`,
  )}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[calc(100vw-1rem)] sm:max-w-[560px] max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 pb-2">
          <DialogTitle className="text-base">
            Biblioteca de exercícios{dayLabel ? ` — ${dayLabel}` : ""}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Selecione um ou mais exercícios para adicionar de uma vez a este treino.
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 pb-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar exercício…"
              className="h-9 text-base md:text-sm pl-8"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 min-h-[240px]">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-xs text-muted-foreground py-10">
              Nenhum exercício encontrado{query ? ` para "${query}"` : ""}.
            </p>
          ) : (
            <ul className="space-y-1 pb-2">
              {filtered.map((item) => {
                const isSelected = selected.has(item.key);
                const alreadyInBlock = existingSet.has(item.key);
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      onClick={() => toggle(item)}
                      className={cn(
                        "w-full flex items-center gap-2.5 rounded-lg border px-2 py-1.5 text-left min-w-0",
                        isSelected ? "border-primary bg-primary/5" : "border-border/50 hover:bg-muted/40",
                      )}
                    >
                      <Checkbox checked={isSelected} onCheckedChange={() => toggle(item)} className="shrink-0" />
                      <img
                        src={item.url}
                        alt=""
                        loading="lazy"
                        className="w-10 h-10 rounded object-cover bg-muted shrink-0"
                      />
                      <span className="flex-1 min-w-0 text-sm truncate">{item.displayName}</span>
                      {alreadyInBlock && (
                        <span
                          title="Já está neste treino"
                          className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-0.5"
                        >
                          <CheckCircle2 className="w-3 h-3" /> já add.
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="p-4 pt-3 border-t border-border/40 gap-2 flex-wrap">
          
            href={mailtoHref}
            className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 flex items-center gap-1 mr-auto"
          >
            <Mail className="w-3 h-3" /> Faltou algum exercício? Pedir ao Admin
          </a>
          <Button
            onClick={handleConfirm}
            disabled={selected.size === 0}
            size="sm"
            className="h-9"
          >
            Adicionar {selected.size > 0 ? `(${selected.size})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
