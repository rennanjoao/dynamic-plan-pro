import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  value: number | string | null | undefined;
  className?: string;
  showLabel?: boolean;
}

/**
 * Exibe estimativa de % de gordura com referência ACE em popover.
 */
export default function BFDisplay({ value, className = "", showLabel = false }: Props) {
  const n = typeof value === "number" ? value : value ? Number(value) : NaN;
  if (!isFinite(n) || n <= 0) return null;

  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {showLabel && <span className="text-[10px] uppercase tracking-wider text-muted-foreground">BF%</span>}
      <span className="font-bold tabular-nums">{n.toFixed(1)}%</span>
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className="text-muted-foreground hover:text-primary" aria-label="Referência BF%">
            <Info className="w-3 h-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-[260px] p-3 text-xs">
          <p className="font-bold mb-2 text-primary">Referência ACE — % de gordura</p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-muted-foreground border-b border-border/40">
                <th className="text-left py-1">Categoria</th>
                <th className="text-right">M</th>
                <th className="text-right">F</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Essencial</td><td className="text-right">2–5%</td><td className="text-right">10–13%</td></tr>
              <tr><td>Atletas</td><td className="text-right">6–13%</td><td className="text-right">14–20%</td></tr>
              <tr><td>Fitness</td><td className="text-right">14–17%</td><td className="text-right">21–24%</td></tr>
              <tr><td>Aceitável</td><td className="text-right">18–24%</td><td className="text-right">25–31%</td></tr>
              <tr><td>Obesidade</td><td className="text-right">≥25%</td><td className="text-right">≥32%</td></tr>
            </tbody>
          </table>
        </PopoverContent>
      </Popover>
    </span>
  );
}