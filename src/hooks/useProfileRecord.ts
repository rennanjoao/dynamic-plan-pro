import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

// A lista de colunas é montada dinamicamente por quem chama o hook (cada
// diálogo pede um subconjunto diferente de `profiles`), então o supabase-js
// não consegue inferir o tipo de retorno a partir da string em tempo de
// compilação. Confinamos o "any" só a esta linha — quem usa o hook recebe
// de volta um `T` já tipado (ver `select<T>()` abaixo).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

export interface UseProfileRecordResult<T> {
  /** Dados da linha carregada, ou null enquanto carrega / se a busca falhou. */
  data: T | null;
  /** true durante a busca inicial (ou uma nova tentativa via refetch). */
  loading: boolean;
  /** Mensagem de erro se a busca falhou; null caso contrário. */
  error: string | null;
  /** Repete a busca (usado pelo botão "Tentar novamente"). */
  refetch: () => void;
}

/**
 * Busca uma linha de `profiles` por `user_id`, com tratamento de erro
 * explícito.
 *
 * Existe para resolver um bug real: o código anterior (duplicado em dois
 * diálogos de perfil) ignorava `error` na resposta do supabase. Se a busca
 * falhasse (rede instável, etc.), os campos ficavam em branco em silêncio —
 * e se o usuário clicasse em "Salvar" nesse estado, o UPDATE sobrescrevia
 * dados reais (nome, PIX, equipe...) com valores vazios. Aqui, uma falha
 * nunca é confundida com "perfil vazio": `data` só é preenchido em caso de
 * sucesso, e quem usa o hook deve checar `error` antes de mostrar o
 * formulário.
 *
 * Também refaz a busca (e limpa `data`) toda vez que `open` passa a
 * `true`, para o formulário sempre refletir o estado mais recente do
 * servidor quando é reaberto — nunca mostrando dados de uma sessão anterior
 * como se fossem atuais.
 */
export function useProfileRecord<T>(
  userId: string | null | undefined,
  open: boolean,
  columns: string,
): UseProfileRecordResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    if (!open || !userId) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setData(null);

    sb.from("profiles")
      .select(columns)
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data: row, error: err }: { data: T | null; error: { message: string } | null }) => {
        if (requestIdRef.current !== requestId) return; // resposta de uma busca já obsoleta
        if (err) {
          setError(err.message);
          setData(null);
        } else {
          setData(row);
        }
      })
      .catch((e: unknown) => {
        if (requestIdRef.current !== requestId) return;
        setError(e instanceof Error ? e.message : "Erro ao carregar dados.");
      })
      .finally(() => {
        if (requestIdRef.current !== requestId) return;
        setLoading(false);
      });
  }, [open, userId, columns, reloadToken]);

  const refetch = useCallback(() => setReloadToken((n) => n + 1), []);

  return { data, loading, error, refetch };
}
