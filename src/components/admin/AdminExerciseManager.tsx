// src/components/admin/AdminExerciseManager.tsx
// Gerenciador visual da biblioteca de exercícios (aba "Biblioteca" do Admin).
// Miniatura + display_name + file_name de cada entrada de `exercise_library`,
// com paginação real no servidor, filtro por grupamento muscular, edição
// completa (nome + grupos) e exclusão (registro + arquivo no Storage).

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Pencil, Search, ImageOff, Trash2 } from "lucide-react";
import {
  EXERCISE_GIFS_BUCKET,
  invalidateExerciseLibraryCache,
} from "@/lib/exerciseLibrary";
import {
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUP_OPTIONS,
  type MuscleGroup,
} from "@/lib/muscleGroupClassifier";
import {
  MOVEMENT_PATTERNS,
  MOVEMENT_PATTERN_LABELS,
  type MovementPattern,
} from "@/lib/movementPatterns";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

const PAGE_SIZE = 24;
const ALL_GROUPS = "__all__";
const NO_PATTERN = "__none__";

interface LibraryRow {
  exercise_key: string;
  file_name: string | null;
  display_name: string | null;
  primary_muscle_group: string | null;
  secondary_muscle_groups: string[] | null;
  movement_pattern: string | null;
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

function groupLabel(g: string | null | undefined): string | null {
  if (!g) return null;
  return MUSCLE_GROUP_LABELS[g as MuscleGroup] ?? g;
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
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUPS);
  const [reloadToken, setReloadToken] = useState(0);

  const [editTarget, setEditTarget] = useState<DisplayRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrimary, setEditPrimary] = useState<string>("");
  const [editSecondary, setEditSecondary] = useState<MuscleGroup[]>([]);
  const [editPattern, setEditPattern] = useState<string>(NO_PATTERN);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<DisplayRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Busca/filtro sempre voltam pra página 0. Fica tudo num único efeito: se
  // mudaram, já buscamos direto a página 0 nesta mesma execução — 1
  // requisição por ação do usuário, nunca 2.
  const prevCriteriaRef = useRef(`${debouncedSearch}|${groupFilter}`);

  useEffect(() => {
    let alive = true;

    const load = async (pageToLoad: number) => {
      setLoading(true);
      const from = pageToLoad * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query = sb
        .from("exercise_library")
        .select(
          "exercise_key, file_name, display_name, primary_muscle_group, secondary_muscle_groups, movement_pattern",
          { count: "exact" },
        )
        .not("file_name", "is", null)
        .order("display_name", { ascending: true, nullsFirst: false });

      if (debouncedSearch) {
        const pattern = escapeIlikeValue(`%${debouncedSearch}%`);
        query = query.or(
          `display_name.ilike.${pattern},file_name.ilike.${pattern},exercise_key.ilike.${pattern}`,
        );
      }

      // Filtro no servidor: bate tanto no grupo primário quanto no array de
      // secundários (`cs` = contains), mantendo a paginação correta.
      if (groupFilter !== ALL_GROUPS) {
        query = query.or(
          `primary_muscle_group.eq.${groupFilter},secondary_muscle_groups.cs.{${groupFilter}}`,
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

    const criteria = `${debouncedSearch}|${groupFilter}`;
    const criteriaChanged = prevCriteriaRef.current !== criteria;
    prevCriteriaRef.current = criteria;

    if (criteriaChanged && page !== 0) {
      setPage(0);
      return;
    }

    load(criteriaChanged ? 0 : page);
    return () => {
      alive = false;
    };
  }, [page, debouncedSearch, groupFilter, reloadToken]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const openEdit = (row: DisplayRow) => {
    setEditTarget(row);
    setEditName(row.display_name ?? row.exercise_key.replace(/_/g, " "));
    setEditPrimary(row.primary_muscle_group ?? "");
    setEditSecondary((row.secondary_muscle_groups ?? []) as MuscleGroup[]);
    setEditPattern(row.movement_pattern ?? NO_PATTERN);
  };

  const toggleSecondary = (g: MuscleGroup) => {
    setEditSecondary((prev) =>
      prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g],
    );
  };

  const confirmEdit = async () => {
    if (!editTarget) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      toast.error("O nome não pode ficar em branco.");
      return;
    }
    if (!editPrimary) {
      toast.error("Selecione o grupo muscular primário.");
      return;
    }

    // Secundário nunca deve repetir o primário.
    const secondary = editSecondary.filter((g) => g !== editPrimary);
    const movementPattern = editPattern === NO_PATTERN ? null : editPattern;

    setSaving(true);
    const { data, error } = await sb
      .from("exercise_library")
      .update({
        display_name: trimmed,
        primary_muscle_group: editPrimary,
        secondary_muscle_groups: secondary,
        movement_pattern: movementPattern,
        classification_source: "manual",
        updated_at: new Date().toISOString(),
      })
      .eq("exercise_key", editTarget.exercise_key)
      .select("exercise_key")
      .maybeSingle();
    setSaving(false);

    if (error) {
      toast.error(`Falha ao salvar: ${error.message}`);
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
        r.exercise_key === editTarget.exercise_key
          ? {
              ...r,
              display_name: trimmed,
              primary_muscle_group: editPrimary,
              secondary_muscle_groups: secondary,
              movement_pattern: movementPattern,
            }
          : r,
      ),
    );
    toast.success("Exercício atualizado.");
    setEditTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    const { data, error } = await sb
      .from("exercise_library")
      .delete()
      .eq("exercise_key", deleteTarget.exercise_key)
      .select("exercise_key")
      .maybeSingle();

    if (error) {
      setDeleting(false);
      toast.error(`Falha ao excluir: ${error.message}`);
      return;
    }
    if (!data) {
      setDeleting(false);
      toast.error("Nada foi excluído — o exercício pode já ter sido removido. Recarregue a lista.");
      setDeleteTarget(null);
      setReloadToken((t) => t + 1);
      return;
    }

    // Remove o arquivo do bucket para não acumular lixo. Falha aqui não
    // desfaz a exclusão do registro — apenas avisa o admin.
    if (deleteTarget.file_name) {
      const { error: storageError } = await supabase.storage
        .from(EXERCISE_GIFS_BUCKET)
        .remove([deleteTarget.file_name]);
      if (storageError) {
        toast.warning(`Registro excluído, mas o arquivo não foi removido: ${storageError.message}`);
      }
    }

    invalidateExerciseLibraryCache();
    setDeleting(false);
    setDeleteTarget(null);
    toast.success("Exercício excluído.");
    // Recarrega a página atual para repor o item que "sobe" da próxima página.
    setReloadToken((t) => t + 1);
  };

  const emptyState = useMemo(() => !loading && rows.length === 0, [loading, rows]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome…"
            className="pl-8 h-9"
          />
        </div>

        <Select value={groupFilter} onValueChange={setGroupFilter}>
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue placeholder="Grupo muscular" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_GROUPS}>Todos os grupos</SelectItem>
            {MUSCLE_GROUP_OPTIONS.map((g) => (
              <SelectItem key={g} value={g}>
                {MUSCLE_GROUP_LABELS[g]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

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
            <div
              key={row.exercise_key}
              className="group relative rounded-xl border border-border overflow-hidden bg-muted/30"
            >
              <button
                type="button"
                onClick={() => openEdit(row)}
                className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-primary"
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
                    <Pencil className="w-3.5 h-3.5 text-primary-foreground" />
                  </div>
                </div>
                <div className="p-2 space-y-1">
                  <p className="text-xs font-semibold truncate">
                    {row.display_name || row.exercise_key.replace(/_/g, " ")}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {row.primary_muscle_group ? (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {groupLabel(row.primary_muscle_group)}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        Sem grupo
                      </Badge>
                    )}
                    {(row.secondary_muscle_groups ?? []).slice(0, 2).map((g) => (
                      <Badge key={g} variant="outline" className="text-[10px] px-1.5 py-0">
                        {groupLabel(g)}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">{row.file_name}</p>
                </div>
              </button>

              <button
                type="button"
                aria-label={`Excluir ${row.display_name || row.exercise_key}`}
                onClick={() => setDeleteTarget(row)}
                className="absolute top-1.5 left-1.5 rounded-full bg-black/60 p-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:bg-destructive"
              >
                <Trash2 className="w-3.5 h-3.5 text-primary-foreground" />
              </button>
            </div>
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

      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar exercício</DialogTitle>
          </DialogHeader>

          {editTarget && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <div className="w-full aspect-video rounded-lg overflow-hidden bg-black/20 flex items-center justify-center">
                  {editTarget.thumbUrl ? (
                    <img
                      src={editTarget.thumbUrl}
                      alt={editTarget.display_name || editTarget.exercise_key}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <ImageOff className="w-6 h-6 text-muted-foreground" />
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {editTarget.file_name}
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Nome de exibição
                </label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmEdit();
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Grupo primário
                </label>
                <Select value={editPrimary} onValueChange={setEditPrimary}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione…" />
                  </SelectTrigger>
                  <SelectContent>
                    {MUSCLE_GROUP_OPTIONS.map((g) => (
                      <SelectItem key={g} value={g}>
                        {MUSCLE_GROUP_LABELS[g]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Grupos secundários (opcional)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {MUSCLE_GROUP_OPTIONS.filter((g) => g !== editPrimary).map((g) => {
                    const active = editSecondary.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleSecondary(g)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border text-muted-foreground hover:border-primary/60"
                        }`}
                      >
                        {MUSCLE_GROUP_LABELS[g]}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Padrão de movimento (opcional)
                </label>
                <Select value={editPattern} onValueChange={setEditPattern}>
                  <SelectTrigger>
                    <SelectValue placeholder="Não classificado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PATTERN}>Não classificado</SelectItem>
                    {MOVEMENT_PATTERNS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {MOVEMENT_PATTERN_LABELS[p as MovementPattern]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={confirmEdit} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir exercício?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir
              {deleteTarget ? ` "${deleteTarget.display_name || deleteTarget.exercise_key}"` : ""}?
              Isso removerá a mídia dos treinos que a utilizam. A ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
