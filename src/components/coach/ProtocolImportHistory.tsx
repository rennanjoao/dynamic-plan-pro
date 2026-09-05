/**
 * ProtocolImportHistory.tsx
 *
 * Lista os logs da tabela `protocol_import_logs` para o coach autenticado.
 * Mostra status com badges:
 *   - success                  → verde
 *   - resolved_with_warnings   → amarelo
 *   - error                    → vermelho
 */

import { useEffect, useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatDateTimePtBR } from "@/lib/formatDate";

interface ImportLogRow {
  id: string;
  file_name: string;
  status: "success" | "resolved_with_warnings" | "error";
  anomalies_count: number;
  resolved_items: unknown;
  student_id: string | null;
  created_at: string;
}

function StatusBadge({ status }: { status: ImportLogRow["status"] }) {
  if (status === "success") {
    return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Sucesso</Badge>;
  }
  if (status === "resolved_with_warnings") {
    return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Resolvido</Badge>;
  }
  return <Badge variant="destructive">Erro</Badge>;
}

export default function ProtocolImportHistory() {
  const [rows, setRows] = useState<ImportLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("protocol_import_logs" as any)
        .select("id, file_name, status, anomalies_count, resolved_items, student_id, created_at")
        .order("created_at", { ascending: false })
        .limit(50);
      if (!active) return;
      if (!error && Array.isArray(data)) setRows(data as unknown as ImportLogRow[]);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="w-4 h-4" /> Histórico de Importações
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma importação registrada ainda.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Arquivo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Anomalias</TableHead>
                <TableHead className="text-right">Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium truncate max-w-[260px]">{r.file_name}</TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                  <TableCell className="text-right">{r.anomalies_count}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatDateTimePtBR(r.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
