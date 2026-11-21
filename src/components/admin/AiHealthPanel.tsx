// src/components/admin/AiHealthPanel.tsx
// Admin > IA: testa as 3 chaves do Groq com um clique (function ai-health) e
// explica em português o que está errado — chave faltando, chave recusada,
// conta sem crédito ou modelo descontinuado. A chave nunca aparece aqui.

import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { functionErrorMessage } from "@/lib/functionError";

type State = "ok" | "sem_chave" | "chave_invalida" | "sem_cota" | "limite" | "modelo_indisponivel" | "erro";

interface KeyResult {
  key: string;
  uso: string;
  state: State;
  message: string;
  model?: string;
  usableModels?: string[];
  visionReady?: boolean | null;
}

interface HealthResponse {
  checkedAt: string;
  groqModel: string | null;
  groqVisionModel: string | null;
  results: KeyResult[];
}

const STATE_LABEL: Record<State, string> = {
  ok: "Funcionando",
  sem_chave: "Sem chave",
  chave_invalida: "Chave recusada",
  sem_cota: "Sem crédito",
  limite: "Limite agora",
  modelo_indisponivel: "Modelo fora do ar",
  erro: "Erro",
};

function StateIcon({ state }: { state: State }) {
  if (state === "ok") return <CheckCircle2 className="w-5 h-5 text-emerald-500" aria-hidden />;
  if (state === "limite") return <AlertTriangle className="w-5 h-5 text-amber-500" aria-hidden />;
  return <XCircle className="w-5 h-5 text-destructive" aria-hidden />;
}

export function AiHealthPanel() {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: res, error: err } = await supabase.functions.invoke("ai-health", { body: {} });
      if (err) throw new Error(await functionErrorMessage(err, "Não foi possível rodar o teste."));
      setData(res as HealthResponse);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível rodar o teste.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="ai-health-panel">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Saúde da IA</h2>
          <p className="text-sm text-muted-foreground">
            Testa cada chave do Groq com uma pergunta curtinha (custo praticamente zero).
          </p>
        </div>
        <Button onClick={run} disabled={loading} className="gap-2" data-testid="ai-health-run">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {loading ? "Testando..." : "Testar IA agora"}
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive" role="alert" data-testid="ai-health-error">
          {error}
          {/não encontrad|failed to send|404/i.test(error) ? " — a function ai-health pode ainda não ter sido publicada." : ""}
        </p>
      )}

      {data && (
        <>
          <ul className="space-y-3">
            {data.results.map((r) => (
              <li key={r.key} className="rounded-lg border border-border p-4 flex gap-3" data-testid={`ai-health-${r.key}`}>
                <StateIcon state={r.state} />
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.uso}</span>
                    <Badge
                      variant={r.state === "ok" ? "outline" : "destructive"}
                      className={r.state === "ok" ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : undefined}
                    >
                      {STATE_LABEL[r.state]}
                    </Badge>
                  </div>
                  <p className="text-sm">{r.message}</p>
                  <p className="text-xs text-muted-foreground break-all">
                    Segredo: {r.key}
                    {r.model ? ` · modelo: ${r.model}` : ""}
                    {r.visionReady === false ? " · atenção: nenhum modelo com leitura de fotos disponível" : ""}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Modelo configurado: {data.groqModel || "padrão do app"}
            {data.groqVisionModel && data.groqVisionModel !== data.groqModel ? ` · fotos: ${data.groqVisionModel}` : ""}
            {" · "}testado em {new Date(data.checkedAt).toLocaleString("pt-BR")}
          </p>
        </>
      )}
    </div>
  );
}
