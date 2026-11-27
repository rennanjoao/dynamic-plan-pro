import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { LEGAL_INFO } from "@/lib/legalInfo";

export function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background px-5 py-8">
      <article className="mx-auto max-w-2xl space-y-6 text-sm leading-relaxed text-foreground/90">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Voltar
        </Link>
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-xs text-muted-foreground">Atualizado em {LEGAL_INFO.updatedAt}</p>
        </header>
        {children}
      </article>
    </main>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}
