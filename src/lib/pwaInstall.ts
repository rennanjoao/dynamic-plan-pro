/** Regras de quando mostrar a ajuda de instalação do app. */

/** iPhone/iPad no navegador (não instalado ainda). */
export function shouldShowIosInstallHelp(env: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  standalone: boolean;
}): boolean {
  if (env.standalone) return false;
  const ua = env.userAgent;
  const isIos = /iPhone|iPad|iPod/i.test(ua) ||
    // iPadOS se apresenta como Mac, mas tem tela de toque
    (env.platform === "MacIntel" && (env.maxTouchPoints ?? 0) > 1);
  return isIos;
}
