import { cn } from "@/lib/utils";

interface Props {
  variant?: "full" | "compact";
  className?: string;
  /**
   * Linha de assinatura (nome/CREF). Nas telas de coach e aluno, passe a do
   * coach certo; `null` esconde. Sem a prop, usa a assinatura da plataforma
   * (páginas públicas: login e home).
   */
  signature?: string | null;
}

const PLATFORM_SIGNATURE = "Rennan Gonçalves · CREF 206788-G/SP";

function Monogram({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path
        d="M10 3h28l7 7v28l-7 7H10l-7-7V10z"
        className="stroke-primary"
        strokeWidth="1.2"
      />
      <path d="M14 15h9M14 24h7M14 33h9M14 15v18" className="stroke-primary" strokeWidth="1.6" strokeLinecap="square" />
      <path d="M28 33V15h4.5a4.5 4.5 0 0 1 0 9H28" className="stroke-primary" strokeWidth="1.6" strokeLinecap="square" />
      <rect x="22.5" y="40" width="3" height="3" className="fill-secondary" />
    </svg>
  );
}

export function ElitePrimeLogo({ variant = "full", className, signature }: Props) {
  const sig = signature === undefined ? PLATFORM_SIGNATURE : signature;
  if (variant === "compact") {
    return (
      <div className={cn("flex items-center gap-3", className)}>
        <Monogram size={34} />
        <div className="flex flex-col leading-none">
          <span className="font-serif text-lg tracking-[0.2em] uppercase text-foreground">Elite Prime</span>
          {sig && (
            <span className="mt-1 w-fit rounded-sm border border-primary/30 px-1.5 py-0.5 text-[9px] font-sans tracking-[0.16em] uppercase text-primary">
              {signature === undefined ? "CREF 206788-G/SP" : sig}
            </span>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col items-center text-center", className)}>
      <Monogram size={56} />
      <span className="mt-4 font-serif text-2xl tracking-[0.24em] uppercase text-foreground">Elite Prime</span>
      <span className="my-3 h-px w-16 bg-primary/60" />
      {sig && (
        <span className="text-[10px] font-sans tracking-[0.2em] uppercase text-muted-foreground">
          {sig}
        </span>
      )}
    </div>
  );
}

export default ElitePrimeLogo;
