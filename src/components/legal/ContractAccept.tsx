// Aceite do contrato em um passo: resumo do plano, CPF e uma caixa "Li e aceito".
// O contrato completo fica recolhido (abre só se o aluno quiser ler).
import { useEffect, useMemo, useState } from "react";
import { Loader2, FileText, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sb } from "@/integrations/supabase/untyped";
import { formatCents } from "@/lib/studentPlans";
import { formatBirthDate, isMinor } from "@/lib/age";
import {
  CONTRACT_TITLE, buildPlanPricing, contractToText, fetchContractParty, formatCpf,
  isValidCpf, recordContractAcceptance, renderContract,
  type CatalogPlanLike, type ContractParty,
} from "@/lib/serviceContract";

export interface ContractAcceptProps {
  studentId: string;
  plan: { slug: string; name: string; duration_months: number };
  finalCents: number;
  catalog: CatalogPlanLike[];
  confirmLabel: string;
  onAccepted: () => void;
  /** Sem coach ativo ou erro ao carregar: segue sem bloquear. */
  onUnavailable?: () => void;
  /** Já aceitou o contrato no cadastro: não pede o CPF de novo, só confirma o plano. */
  known?: { cpf: string; guardianName?: string | null } | null;
}

interface StudentInfo { name: string; email: string | null; city: string | null; birth: string | null }

export function ContractAccept({ studentId, plan, finalCents, catalog, confirmLabel, onAccepted, onUnavailable, known }: ContractAcceptProps) {
  const [party, setParty] = useState<ContractParty | null>(null);
  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [cpf, setCpf] = useState(known?.cpf ?? "");
  const [guardianName, setGuardianName] = useState(known?.guardianName ?? "");
  const [accepted, setAccepted] = useState(false);
  const [showFull, setShowFull] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [p, ana] = await Promise.all([
        fetchContractParty(),
        sb.from("anamnesis")
          .select("nome:payload->>nome, email:payload->>email, cidade:payload->>cidade, data_nasc:payload->>data_nasc")
          .eq("student_id", studentId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (!p) { setLoading(false); onUnavailable?.(); return; }
      const a = (ana.data ?? {}) as { nome?: string; email?: string; cidade?: string; data_nasc?: string };
      setParty(p);
      setStudent({ name: a.nome?.trim() || "Aluno(a)", email: a.email ?? null, city: a.cidade ?? null, birth: a.data_nasc ?? null });
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId]);

  const minor = isMinor(student?.birth);
  const pricing = useMemo(() => buildPlanPricing(plan, finalCents, catalog, party?.partner_code), [plan, finalCents, catalog, party]);
  const sections = useMemo(() => {
    if (!party || !student) return [];
    return renderContract({
      party,
      catalog,
      student: {
        name: student.name,
        email: student.email,
        city: student.city,
        birthDate: student.birth ? formatBirthDate(student.birth) : null,
        cpf: minor ? null : cpf,
      },
      guardian: minor ? { name: guardianName || "—", cpf } : null,
      pricing,
    });
  }, [party, student, pricing, cpf, guardianName, minor, catalog]);

  const submit = async () => {
    if (!party || !student) return;
    if (!isValidCpf(cpf)) { setError(minor ? "Confira o CPF do responsável." : "Confira o seu CPF."); return; }
    if (minor && guardianName.trim().length < 3) { setError("Informe o nome do responsável."); return; }
    if (!accepted) { setError("Marque \"Li e aceito\" para continuar."); return; }
    setSaving(true); setError("");
    try {
      await recordContractAcceptance({
        studentId, party, pricing, cpf,
        guardian: minor ? { name: guardianName, cpf } : null,
        text: contractToText(CONTRACT_TITLE, sections),
      });
      onAccepted();
    } catch {
      setError("Não foi possível registrar agora. Tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!party || !student) return null;

  return (
    <div className="space-y-4" data-testid="contract-accept">
      <div className="rounded-xl border border-border bg-muted/30 p-3 text-sm">
        <p className="font-semibold text-foreground">
          Plano {pricing.planName} · {pricing.months === 1 ? "1 mês" : `${pricing.months} meses`}
        </p>
        {pricing.discounts.length > 0 ? (
          <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            <p>De <span className="line-through">{formatCents(pricing.listCents)}</span> por{" "}
              <span className="font-semibold text-foreground">{formatCents(pricing.finalCents)}</span></p>
            {pricing.discounts.map((d) => (
              <p key={d.label} className="text-primary">{d.label}: −{formatCents(d.cents)}</p>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">{formatCents(pricing.finalCents)}</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">Desistência em 7 dias com reembolso total. Sem renovação automática.</p>
      </div>

      {minor && !known && (
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">Nome do responsável</span>
          <Input value={guardianName} onChange={(e) => setGuardianName(e.target.value)} autoComplete="name" />
        </label>
      )}
      {!known && <label className="block space-y-1 text-sm">
        <span className="text-muted-foreground">{minor ? "CPF do responsável" : "Seu CPF"}</span>
        <Input
          value={formatCpf(cpf)}
          onChange={(e) => setCpf(e.target.value.replace(/\D/g, "").slice(0, 11))}
          inputMode="numeric"
          placeholder="000.000.000-00"
          autoComplete="off"
          aria-invalid={!!error && !isValidCpf(cpf)}
        />
      </label>}

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
        />
        <span className="text-sm text-foreground">
          {known ? "Confirmo o plano, o desconto e o " : "Li e aceito o "}
          <button type="button" className="underline text-primary" onClick={() => setShowFull((v) => !v)}>
            contrato de prestação de serviços
          </button>
          {minor ? ", como responsável legal." : "."}
        </span>
      </label>

      {showFull && (
        <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-background p-3 text-xs leading-relaxed text-foreground/90 space-y-3" data-testid="contract-full">
          <p className="font-semibold flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" aria-hidden="true" />{CONTRACT_TITLE}</p>
          {sections.map((s) => (
            <div key={s.title} className="space-y-1">
              <p className="font-semibold">{s.title}</p>
              {s.items.map((it) => <p key={it}>{it}</p>)}
            </div>
          ))}
        </div>
      )}
      {!showFull && (
        <button type="button" onClick={() => setShowFull(true)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> Ler o contrato completo
        </button>
      )}

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button className="w-full h-11 font-bold" onClick={submit} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmLabel}
      </Button>
    </div>
  );
}
