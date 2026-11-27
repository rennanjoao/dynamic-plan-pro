// Contrato na última etapa da anamnese: CPF + "Li e aceito" (o texto completo
// fica recolhido). Aparece junto da caixa de autorização de dados.
import { useState } from "react";
import { ChevronDown, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CONTRACT_TITLE, formatCpf, type ContractSection } from "@/lib/serviceContract";

export interface SignupContractValue { cpf: string; accepted: boolean }

export function SignupContractFields({
  value, onChange, sections, minor, valuesLine,
}: {
  value: SignupContractValue;
  onChange: (v: SignupContractValue) => void;
  sections: ContractSection[];
  minor: boolean;
  /** Ex.: "Mensal R$ 350,00 · Trimestral R$ 892,50". */
  valuesLine?: string | null;
}) {
  const [showFull, setShowFull] = useState(false);
  return (
    <div className="rounded-xl border-2 border-primary/50 bg-primary/5 p-4 space-y-3" data-testid="signup-contract">
      <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">{minor ? "CPF do responsável" : "Seu CPF"}</span>
        <Input
          name="cpf"
          value={formatCpf(value.cpf)}
          onChange={(e) => onChange({ ...value, cpf: e.target.value.replace(/\D/g, "").slice(0, 11) })}
          inputMode="numeric"
          placeholder="000.000.000-00"
          autoComplete="off"
        />
      </label>
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="contract_accept"
          checked={value.accepted}
          onChange={(e) => onChange({ ...value, accepted: e.target.checked })}
          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
        />
        <span className="text-sm font-semibold text-foreground">
          Li e aceito o{" "}
          <button type="button" className="underline text-primary font-semibold" onClick={() => setShowFull((v) => !v)}>
            contrato de prestação de serviços
          </button>
          {minor ? ", como responsável legal." : "."}
        </span>
      </label>
      {valuesLine && <p className="text-xs text-muted-foreground">Valores dos planos: {valuesLine}. Desistência em 7 dias com reembolso total.</p>}
      {showFull ? (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-foreground/90 space-y-3" data-testid="signup-contract-full">
          <p className="font-semibold flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" aria-hidden="true" />{CONTRACT_TITLE}</p>
          {sections.map((s) => (
            <div key={s.title} className="space-y-1">
              <p className="font-semibold">{s.title}</p>
              {s.items.map((it) => <p key={it}>{it}</p>)}
            </div>
          ))}
        </div>
      ) : (
        <button type="button" onClick={() => setShowFull(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> Ler o contrato completo
        </button>
      )}
    </div>
  );
}
