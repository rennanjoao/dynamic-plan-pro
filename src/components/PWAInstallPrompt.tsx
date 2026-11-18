/**
 * PWAInstallPrompt.tsx — Banner discreto de instalação do app.
 *
 * Android/Chrome: aparece quando o navegador dispara `beforeinstallprompt`
 * e instala com 1 toque.
 * iPhone/iPad (Safari): o iOS NÃO dispara esse evento — antes a aluna de
 * iPhone nunca era orientada. Agora, na área do aluno, mostramos o passo a
 * passo (Compartilhar → Adicionar à Tela de Início).
 * Persiste a recusa no localStorage para não re-aparecer.
 */

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { shouldShowIosInstallHelp } from "@/lib/pwaInstall";

const DISMISSED_KEY = "pwa-install-dismissed";

function isStandalone(): boolean {
  try {
    return window.matchMedia?.("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
  } catch {
    return false;
  }
}

export function PWAInstallPrompt() {
  const location = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [visible, setVisible] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    // Não mostra se já foi dispensado
    if (localStorage.getItem(DISMISSED_KEY) === "1") return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  // iOS: só na tela inicial da aluna (não no cadastro nem no meio do treino).
  useEffect(() => {
    if (location.pathname !== "/student-area") { setIosHelp(false); return; }
    try { if (localStorage.getItem(DISMISSED_KEY) === "1") return; } catch { return; }
    const show = shouldShowIosInstallHelp({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      standalone: isStandalone(),
    });
    if (!show) return;
    const t = setTimeout(() => setIosHelp(true), 2500); // não compete com o carregamento
    return () => clearTimeout(t);
  }, [location.pathname]);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setVisible(false);
    }
    setDeferredPrompt(null);
  }

  function handleDismiss() {
    try { localStorage.setItem(DISMISSED_KEY, "1"); } catch { /* noop */ }
    setVisible(false);
    setIosHelp(false);
  }

  if (iosHelp && !visible) {
    return (
      <div className="fixed bottom-4 left-4 right-4 z-50 max-w-sm mx-auto" role="dialog" aria-label="Instalar o app no iPhone">
        <div className="bg-card border border-primary/30 rounded-2xl shadow-lg p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Download className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Instale o app no seu iPhone</p>
              <p className="text-sm text-muted-foreground leading-snug mt-1">
                Abre mais rápido e fica na tela inicial, como um aplicativo.
              </p>
              <ol className="mt-2 space-y-1.5 text-sm text-foreground">
                <li className="flex items-center gap-2">
                  <span className="font-bold">1.</span> Toque em <Share className="w-4 h-4 text-primary" aria-label="Compartilhar" /> <strong>Compartilhar</strong> (barra do Safari)
                </li>
                <li className="flex items-center gap-2">
                  <span className="font-bold">2.</span> Escolha <SquarePlus className="w-4 h-4 text-primary" aria-hidden /> <strong>Adicionar à Tela de Início</strong>
                </li>
              </ol>
            </div>
            <Button size="sm" variant="ghost" onClick={handleDismiss} className="h-8 w-8 p-0 text-muted-foreground" aria-label="Fechar">
              <X className="w-4 h-4" />
            </Button>
          </div>
          <Button size="sm" variant="outline" onClick={handleDismiss} className="w-full mt-3 h-9 text-sm">
            Entendi
          </Button>
        </div>
      </div>
    );
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 max-w-sm mx-auto">
      <div className="bg-card border border-primary/30 rounded-2xl shadow-lg p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Download className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">Instalar o app</p>
          <p className="text-xs text-muted-foreground leading-snug">
            Acesse o Elite Prime diretamente da sua tela inicial.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" onClick={handleInstall} className="h-8 text-xs">
            Instalar
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDismiss}
            className="h-8 w-8 p-0 text-muted-foreground"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
