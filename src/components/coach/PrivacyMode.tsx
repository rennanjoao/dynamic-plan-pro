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
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
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
  return (
    <PrivacyContext.Provider value={value}>
      <PrivacyBanner />
      {children}
    </PrivacyContext.Provider>
  );
}

/** Faixa fixa e discreta indicando que o modo privado está ativo. */
export function PrivacyBanner() {
  const { privacy } = usePrivacyMode();
  if (!privacy) return null;
  return (
    <div
      role="status"
      className="fixed top-0 inset-x-0 z-[60] flex items-center justify-center gap-1.5 py-1 text-[11px] font-semibold uppercase tracking-wider bg-primary/90 text-primary-foreground shadow-sm pointer-events-none"
    >
      <ShieldCheck className="w-3.5 h-3.5" />
      Modo privado ativo
    </div>
  );
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
export function PrivateImg({ className = "", src, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const { privacy } = usePrivacyMode();
  const resolved = useMediaUrl(typeof src === "string" ? src : null);
  return (
    <img
      {...rest}
      src={resolved || undefined}
      className={`${className} ${privacy ? "blur-xl select-none pointer-events-none" : ""}`.trim()}
    />
  );
}

/** Texto pessoal usado onde não é possível renderizar um elemento (títulos de exportação, etc). */
export function usePrivateText() {
  const { privacy } = usePrivacyMode();
  return useCallback((value?: string | null) => (privacy ? "Aluno" : value ?? ""), [privacy]);
}

/**
 * Bloco de campos de formulário com dados sensíveis (peso, medidas).
 * Em modo privado o conteúdo fica borrado e não-interativo até o coach
 * revelar explicitamente — evita editar um valor que não dá pra conferir.
 */
export function PrivateField({ children, label = "Revelar para editar" }: { children: ReactNode; label?: string }) {
  const { privacy } = usePrivacyMode();
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (!privacy) setRevealed(false);
  }, [privacy]);

  const hidden = privacy && !revealed;

  return (
    <div className="relative">
      <fieldset
        disabled={hidden}
        className={hidden ? "blur-sm select-none pointer-events-none" : undefined}
      >
        {children}
      </fieldset>
      {hidden && (
        <div className="absolute inset-0 flex items-start justify-center pt-2">
          <Button type="button" size="sm" variant="secondary" className="h-8 text-xs gap-1.5" onClick={() => setRevealed(true)}>
            <Eye className="w-3.5 h-3.5" />
            {label}
          </Button>
        </div>
      )}
    </div>
  );
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
