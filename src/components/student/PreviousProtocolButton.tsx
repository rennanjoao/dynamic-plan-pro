// PreviousProtocolButton.tsx
// Botão discreto exibido ao aluno na PRIMEIRA SEMANA após uma atualização do
// protocolo (protocols.updated_at < 7 dias). Abre um Sheet somente-leitura com
// a versão ANTERIOR do treino ou da dieta (última linha de protocol_versions,
// que guarda o payload publicado antes da atualização).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { History } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function PreviousProtocolButton({
  studentId,
  kind,
}: {
  studentId: string | null;
  kind: "treino" | "dieta";
}) {
  const [open, setOpen] = useState(false);

  const { data } = useQuery({
    queryKey: ["previous-protocol-version", studentId],
    enabled: !!studentId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: protocol } = await sb
        .from("protocols")
        .select("id, updated_at")
        .eq("student_id", studentId)
        .eq("active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!protocol) return null;
      const updatedAt = new Date(protocol.updated_at).getTime();
      if (Date.now() - updatedAt > WEEK_MS) return null;

      const { data: version } = await sb
        .from("protocol_versions")
        .select("version, payload, created_at")
        .eq("protocol_id", protocol.id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!version) return null;
      return { updatedAt: protocol.updated_at, version };
    },
  });

  if (!data) return null;

  const payload = data.version.payload ?? {};
  const workouts: any[] = Array.isArray(payload.workouts) ? payload.workouts : [];
  const meals: any[] = Array.isArray(payload.meals) ? payload.meals : [];

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <History className="w-3.5 h-3.5" />
        Ver {kind === "treino" ? "treino" : "dieta"} anterior
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <History className="w-4 h-4" />
              {kind === "treino" ? "Treino anterior" : "Dieta anterior"}
            </SheetTitle>
          </SheetHeader>
          <p className="text-xs text-muted-foreground mt-1">
            Versão usada antes da atualização de{" "}
            {new Date(data.updatedAt).toLocaleDateString("pt-BR")}. Somente leitura.
          </p>

          <div className="mt-4 space-y-4">
            {kind === "treino" &&
              (workouts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem treinos na versão anterior.</p>
              ) : (
                workouts.map((day, i) => (
                  <div key={i} className="rounded-lg border border-border/60 p-3">
                    <p className="text-sm font-bold text-foreground">
                      Treino {day?.key} {day?.focus ? `— ${day.focus}` : ""}
                    </p>
                    <ul className="mt-2 space-y-1">
                      {(day?.exercises ?? [])
                        .filter((ex: any) => String(ex?.name ?? "").trim())
                        .map((ex: any, j: number) => (
                          <li key={j} className="text-xs text-muted-foreground">
                            <span className="text-foreground">{ex.name}</span>
                            {ex.sets ? ` · ${ex.sets}` : ""}
                            {ex.reps ? ` · ${ex.reps}` : ""}
                            {ex.rest ? ` · desc. ${ex.rest}` : ""}
                          </li>
                        ))}
                    </ul>
                  </div>
                ))
              ))}

            {kind === "dieta" &&
              (meals.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem refeições na versão anterior.</p>
              ) : (
                meals.map((meal, i) => (
                  <div key={i} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-foreground">{meal?.name || `Refeição ${i + 1}`}</p>
                      {meal?.time && <Badge variant="secondary" className="text-[10px]">{meal.time}</Badge>}
                    </div>
                    <ul className="mt-2 space-y-1">
                      {(meal?.options ?? []).map((opt: any, oi: number) => {
                        const items = (opt?.items ?? []).filter((it: any) => String(it?.name ?? "").trim());
                        if (!items.length) return null;
                        return (
                          <li key={oi} className="text-xs text-muted-foreground">
                            <span className="text-foreground">{opt?.title || opt?.kind}:</span>{" "}
                            {items.map((it: any) => `${it.name}${it.weight ? ` (${it.weight})` : ""}`).join(", ")}
                          </li>
                        );
                      })}
                    </ul>
                    {meal?.notes && <p className="text-[11px] italic text-muted-foreground mt-1.5">{meal.notes}</p>}
                  </div>
                ))
              ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
