/**
 * AccessLogPanel.tsx — Painel de "Quem está online" e histórico de acessos.
 * Usado pelo Admin.tsx.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Search, Circle, Clock } from "lucide-react";

interface AccessLog {
  id: string;
  user_id: string;
  role: string;
  full_name: string | null;
  email: string | null;
  accessed_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

function roleBadge(role: string) {
  if (role === "admin") return "bg-red-100 text-red-700 border-red-200";
  if (role === "coach") return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-muted text-muted-foreground border-border";
}

function roleLabel(role: string) {
  if (role === "admin") return "Admin";
  if (role === "coach") return "Coach";
  return "Aluno";
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function isOnline(iso: string) {
  return new Date(iso) >= new Date(Date.now() - 15 * 60 * 1000);
}

export function AccessLogPanel() {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterOnline, setFilterOnline] = useState(false);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("access_logs")
        .select("*")
        .order("accessed_at", { ascending: false })
        .limit(200);
      if (!error && data) setLogs(data as AccessLog[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLogs(); }, [loadLogs]);

  const onlineNow = logs.filter((l) => isOnline(l.accessed_at));

  // Deduplica por user_id para "online agora" (mostra só o acesso mais recente)
  const onlineUnique = Array.from(
    new Map(onlineNow.map((l) => [l.user_id, l])).values()
  );

  const filtered = logs.filter((l) => {
    const matchSearch =
      !search ||
      (l.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (l.email || "").toLowerCase().includes(search.toLowerCase()) ||
      l.role.toLowerCase().includes(search.toLowerCase());
    const matchOnline = !filterOnline || isOnline(l.accessed_at);
    return matchSearch && matchOnline;
  });

  return (
    <div className="space-y-6">
      {/* Online Agora */}
      <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Circle className="w-3 h-3 fill-emerald-500 text-emerald-500 animate-pulse" />
            Online agora
            <span className="ml-1 text-xs font-normal text-muted-foreground">(últimos 15 min)</span>
          </h3>
          <Button size="sm" variant="ghost" onClick={loadLogs} className="h-7 text-xs gap-1">
            <RefreshCw className="w-3 h-3" /> Atualizar
          </Button>
        </div>
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-primary" /></div>
        ) : onlineUnique.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum usuário ativo no momento.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {onlineUnique.map((l) => (
              <div key={l.user_id} className="flex items-center gap-1.5 bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs">
                <Circle className="w-2 h-2 fill-emerald-500 text-emerald-500" />
                <span className="font-medium text-foreground">{l.full_name || l.email || "Usuário"}</span>
                <Badge variant="outline" className={`text-[10px] px-1.5 ${roleBadge(l.role)}`}>{roleLabel(l.role)}</Badge>
                <span className="text-muted-foreground">{fmtDate(l.accessed_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Histórico */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            Histórico de acessos
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterOnline((v) => !v)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                filterOnline
                  ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                  : "bg-card text-muted-foreground border-border hover:bg-accent"
              }`}
            >
              Apenas online
            </button>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrar..."
                className="pl-7 h-8 text-xs w-44"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum registro encontrado.</p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Usuário</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Tipo</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium">Acesso</th>
                  <th className="text-left px-3 py-2 text-muted-foreground font-medium hidden sm:table-cell">Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 100).map((l) => (
                  <tr key={l.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                    <td className="px-3 py-2">
                      <p className="font-medium text-foreground">{l.full_name || "—"}</p>
                      <p className="text-muted-foreground text-[10px]">{l.email || l.user_id.slice(0, 8) + "..."}</p>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className={`text-[10px] ${roleBadge(l.role)}`}>{roleLabel(l.role)}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{fmtDate(l.accessed_at)}</td>
                    <td className="px-3 py-2 hidden sm:table-cell">
                      {isOnline(l.accessed_at) ? (
                        <span className="flex items-center gap-1 text-emerald-600 font-medium">
                          <Circle className="w-2 h-2 fill-emerald-500" /> Online
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Offline</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length > 100 && (
              <p className="text-center text-xs text-muted-foreground py-2 bg-muted/20">
                Exibindo 100 de {filtered.length} registros
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
