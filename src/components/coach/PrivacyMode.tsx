/**
 * PrivacyMode.tsx — Modo Privacidade do painel do coach.
 *
 * Estado global simples (Context) que apenas oculta dados que IDENTIFICAM o
 * aluno (nome, foto, e-mail, telefone, CPF, data de nascimento…). Protocolos,
 * dieta, treino, métricas, gráficos, fotos corporais e IA continuam visíveis.
 *
 * Persiste somente na sessão atual (sessionStorage) — nada vai para o banco.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";

const SESSION_KEY = "epx_privacy_mode";

const PrivacyContext = createContext<{ privacy: boolean; setPrivacy: (v: boolean) => void }>({
  privacy: false,
  setPrivacy: () => {},
});

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [privacy, setPrivacyState] = useState(false);

  useEffect(() => {
    try { setPrivacyState(sessionStorage.getItem(SESSION_KEY) === "1"); } catch { /* noop */ }
  }, []);

  const setPrivacy = useCallback((v: boolean) => {
    setPrivacyState(v);
    try { sessionStorage.setItem(SESSION_KEY, v ? "1" : "0"); } catch { /* noop */ }
  }, []);

  const value = useMemo(() => ({ privacy, setPrivacy }), [privacy, setPrivacy]);
  return <PrivacyContext.Provider value={value}>{children}</PrivacyContext.Provider>;
}

export function usePrivacyMode() {
  return useContext(PrivacyContext);
}

/** Envolve qualquer dado pessoal. Fora do provider, comporta-se como um span comum. */
export function Private({
  children,
  className = "",
  as: Tag = "span",
}: {
  children: ReactNode;
  className?: string;
  as?: "span" | "div" | "p";
}) {
  const { privacy } = usePrivacyMode();
  return (
    <Tag
      className={`${className} ${privacy ? "blur-[5px] select-none pointer-events-none" : ""}`.trim()}
      aria-hidden={privacy || undefined}
    >
      {children}
    </Tag>
  );
}

/** Texto pessoal usado onde não é possível renderizar um elemento (títulos de exportação, etc). */
export function usePrivateText() {
  const { privacy } = usePrivacyMode();
  return useCallback((value?: string | null) => (privacy ? "Aluno" : value ?? ""), [privacy]);
}

/** Botão discreto + indicador de estado. */
export function PrivacyToggle() {
  const { privacy, setPrivacy } = usePrivacyMode();
  return (
    <Button
      variant={privacy ? "default" : "ghost"}
      size="sm"
      onClick={() => setPrivacy(!privacy)}
      className="h-9 gap-1.5 text-xs"
      title="Oculta apenas dados pessoais dos alunos (nome, contato, foto). Protocolos e métricas seguem visíveis."
    >
      {privacy ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
      <span className="hidden sm:inline">{privacy ? "Privacidade ativa" : "Modo Privacidade"}</span>
    </Button>
  );
}
