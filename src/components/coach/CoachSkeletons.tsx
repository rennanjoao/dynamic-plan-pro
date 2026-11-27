// Esqueletos de carregamento das telas do coach: o mesmo formato da tela final, para o conteúdo
// entrar no lugar sem a página "pular". Só visual — nenhuma regra ou dado aqui.
import { Skeleton } from "@/components/ui/skeleton";

function Busy({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div role="status" aria-busy="true" aria-live="polite" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/** Construtor de protocolo: nome, abas, barra de macros e as refeições. */
export function ProtocolBuilderSkeleton() {
  return (
    <Busy label="Carregando protocolo…" className="space-y-4">
      <div className="rounded-2xl border border-border p-4 space-y-3">
        <Skeleton className="h-3 w-32" />
        <div className="flex gap-2">
          <Skeleton className="h-11 flex-1 rounded-lg" />
          <Skeleton className="h-11 w-24 rounded-lg hidden sm:block" />
          <Skeleton className="h-11 w-20 rounded-lg" />
        </div>
      </div>
      <Skeleton className="h-12 w-full rounded-xl" />
      <div className="rounded-xl border border-border p-4 space-y-3">
        <Skeleton className="h-3 w-40" />
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className={`h-6 ${i > 2 ? "hidden sm:block" : ""}`} />)}
        </div>
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full rounded-xl" />
      ))}
    </Busy>
  );
}

/** Lista de alunos do painel: linhas com foto, nome e selos. */
export function StudentListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <Busy label="Carregando alunos…" className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3.5 rounded-xl border border-border bg-card">
          <Skeleton className="w-10 h-10 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full hidden sm:block" />
          <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
        </div>
      ))}
    </Busy>
  );
}

/** Seção genérica (abas da ficha do aluno, telas carregando sob demanda). */
export function SectionSkeleton() {
  return (
    <Busy label="Carregando…" className="space-y-3 py-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <Skeleton className="h-4 w-1/2" />
    </Busy>
  );
}
