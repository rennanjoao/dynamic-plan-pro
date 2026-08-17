// src/components/admin/AdminExerciseManager.tsx
// Gerenciador visual da biblioteca de exercícios (aba "Biblioteca" do Admin).
// Miniatura + display_name + file_name de cada entrada de `exercise_library`,
// com paginação real no servidor e renomeio via modal com preview do gif.

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Pencil, Search, ImageOff } from "lucide-react";
import {
  EXERCISE_GIFS_BUCKET,
  invalidateExerciseLibraryCache,
} from "@/lib/exerciseLibrary";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const PAGE_SIZE = 24;

interface LibraryRow {
  exercise_key: string;
  file_name: string | null;
  display_name: string | null;
}

interface DisplayRow extends LibraryRow {
  thumbUrl: string | null;
}

function toDisplayRow(row: LibraryRow): DisplayRow {
  const thumbUrl = row.file_name
    ? supabase.storage.from(EXERCISE_GIFS_BUCKET).getPublicUrl(row.file_name).data.publicUrl
    : null;
  return { ...row, thumbUrl };
}

/**
 * PostgREST exige que valores de filtro em `.or()` contendo caracteres
 * reservados (`,` `(` `)` `"` `\`) venham entre aspas duplas — senão a
 * vírgula/parêntese é interpretada como separador de condição e a query
 * quebra (erro PGRST100) ou retorna resultado errado. Nomes de exercício
 * reais frequentemente têm parênteses (ex.: "Supino reto (barra)"), então
 * isso quebra na prática, não é só teórico.
 */
function escapeIlikeValue(v: string): string {
  const escaped = v.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

export function AdminExerciseManager() {
  const [rows, setRows] = useState<DisplayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [renameTarget, setRenameTarget] = useState<DisplayRow | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Busca sempre volta pra página 0. Fica tudo num único efeito: se a busca
  // mudou, já buscamos direto a página 0 nesta mesma execução — 1
  // requisição por ação do usuário, nunca 2.
  const prevSearchRef = useRef(debouncedSearch);

  useEffect(() => {
    let alive = true;

    const load = async (pageToLoad: number) => {
      setLoading(true);
      const from = pageToLoad * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = sb
        .from("exercise_library")
        .select("exercise_key, file_name, display_name", { count: "exact" })
        .not("file_name", "is", null)
        .order("display_name", { ascending: true, nullsFirst: false });

      if (debouncedSearch) {
        const pattern = escapeIlikeValue(`%${debouncedSearch}%`);
        query = query.or(
          `display_name.ilike.${pattern},file_name.ilike.${pattern},exercise_key.ilike.${pattern}`,
        );
      }

      const { data, error, count } = await query.range(from, to);
      if (!alive) return;

      if (error) {
        toast.error(`Falha ao carregar biblioteca: ${error.message}`);
        setRows([]);
        setTotalCount(0);
      } else {
        setRows(((data ?? []) as LibraryRow[]).map(toDisplayRow));
        setTotalCount(count ?? 0);
      }
      setLoading(false);
    };

    const searchChanged = prevSearchRef.current !== debouncedSearch;
    prevSearchRef.current = debouncedSearch;

    if (searchChanged && page !== 0) {
      setPage(0);
      return;
    }

    load(searchChanged ? 0 : page);
    return () => {
      alive = false;
    };
  }, [page, debouncedSearch]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const openRename = (row: DisplayRow) => {
    setRenameTarget(row);
    setRenameValue(row.display_name ?? row.exercise_key.replace(/_/g, " "));
  };

  const confirmRename = async () => {
    if (!renameTarget) return;
    const trimmed = renameValue.trim();
    if (!trimmed) {
      toast.error("O nome não pode ficar em branco.");
      return;
    }

    setSaving(true);
    const { data, error } = await sb
      .from("exercise_library")
      .update({ display_name: trimmed, updated_at: new Date().toISOString() })
      .eq("exercise_key", renameTarget.exercise_key)
      .select("exercise_key")
      .maybeSingle();
    setSaving(false);

    if (error) {
      toast.error(`Falha ao renomear: ${error.message}`);
      return;
    }

    // .update() não gera erro quando 0 linhas batem no filtro — ex.: o
    // exercício foi removido por outro admin entre a abertura do modal e o
    // clique em "Salvar". Sem checar `data`, isso apareceria como sucesso
    // falso-positivo.
    if (!data) {
      toast.error("Não foi possível confirmar a atualização — o exercício pode ter sido removido. Recarregue a lista.");
      return;
    }

    invalidateExerciseLibraryCache();

    setRows((prev) =>
      prev.map((r) =>
        r.exercise_key === renameTarget.exercise_key ? { ...r, display_name: trimmed } : r,
      ),
    );
    toast.success("Exercício renomeado.");
    setRenameTarget(null);
  };

  const emptyState = useMemo(() => !loading && rows.length === 0, [loading, rows]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome…"
            className="pl-8 h-9"
          />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {totalCount} exercício{totalCount === 1 ? "" : "s"}
        </span>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <Skeleton key={i} className="w-full aspect-square rounded-xl" />
          ))}
        </div>
      ) : emptyState ? (
        <div className="text-sm text-muted-foreground py-10 text-center">
          Nenhum exercício encontrado{debouncedSearch ? ` para "${debouncedSearch}"` : ""}.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {rows.map((row) => (
            <button
              key={row.exercise_key}
              type="button"
              onClick={() => openRename(row)}
              className="group relative rounded-xl border border-border overflow-hidden bg-muted/30 text-left focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <div className="relative w-full aspect-square bg-black/20">
                {row.thumbUrl ? (
                  <img
                    src={row.thumbUrl}
                    alt={row.display_name || row.exercise_key}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <ImageOff className="w-6 h-6 text-muted-foreground" />
                  </div>
                )}
                <div className="absolute top-1.5 right-1.5 rounded-full bg-black/60 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Pencil className="w-3.5 h-3.5 text-white" />
                </div>
              </div>
              <div className="p-2">
                <p className="text-xs font-semibold truncate">
                  {row.display_name || row.exercise_key.replace(/_/g, " ")}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{row.file_name}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {page + 1} de {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1 || loading}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Renomear exercício</DialogTitle>
          </DialogHeader>

          {renameTarget && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="w-full aspect-video rounded-lg overflow-hidden bg-black/20 flex items-center justify-center">
                  {renameTarget.thumbUrl ? (
                    <img
                      src={renameTarget.thumbUrl}
                      alt={renameTarget.display_name || renameTarget.exercise_key}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <ImageOff className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {renameTarget.file_name}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Nome de exibição
                </label>
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmRename();
                  }}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameTarget(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={confirmRename} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
