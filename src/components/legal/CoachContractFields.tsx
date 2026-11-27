// Perfil do coach: CREF e CPF/CNPJ que aparecem no contrato do aluno.
// Salva à parte do resto do perfil (o CPF/CNPJ fica numa tabela protegida).
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sb } from "@/integrations/supabase/untyped";
import { formatDocument, isValidCpfOrCnpj, onlyDigits } from "@/lib/serviceContract";

export function CoachContractFields({ coachId }: { coachId: string }) {
  const [cref, setCref] = useState("");
  const [doc, setDoc] = useState("");
  const [company, setCompany] = useState("");
  const [instagram, setInstagram] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      sb.from("profiles").select("cref").eq("user_id", coachId).maybeSingle(),
      sb.from("coach_contract_settings").select("document, company_name, instagram").eq("coach_id", coachId).maybeSingle(),
    ]).then(([p, c]) => {
      if (cancelled) return;
      setCref((p.data as { cref?: string } | null)?.cref ?? "");
      const cs = (c.data ?? null) as { document?: string; company_name?: string; instagram?: string } | null;
      setDoc(formatDocument(cs?.document) ?? "");
      setCompany(cs?.company_name ?? "");
      setInstagram(cs?.instagram ?? "");
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [coachId]);

  const save = async () => {
    if (doc && !isValidCpfOrCnpj(doc)) { toast.error("CPF ou CNPJ inválido."); return; }
    setSaving(true);
    try {
      const [p, c] = await Promise.all([
        sb.from("profiles").update({ cref: cref.trim() || null }).eq("user_id", coachId),
        sb.from("coach_contract_settings").upsert({
          coach_id: coachId,
          document: onlyDigits(doc) || null,
          company_name: company.trim() || null,
          instagram: instagram.trim().replace(/^@/, "") || null,
          updated_at: new Date().toISOString(),
        }),
      ]);
      if (p.error || c.error) throw p.error || c.error;
      setDoc(formatDocument(doc) ?? doc);
      toast.success("Dados do contrato salvos.");
    } catch {
      toast.error("Não foi possível salvar os dados do contrato.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <p className="text-xs font-bold text-foreground">Dados do contrato com o aluno</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">CREF</Label>
          <Input value={cref} onChange={(e) => setCref(e.target.value)} placeholder="000000-G/SP" className="mt-1 h-9 text-sm" disabled={!loaded} />
        </div>
        <div>
          <Label className="text-xs">CPF ou CNPJ</Label>
          <Input value={doc} onChange={(e) => setDoc(e.target.value)} inputMode="numeric" className="mt-1 h-9 text-sm" disabled={!loaded} />
        </div>
      </div>
      {onlyDigits(doc).length === 14 && (
        <div>
          <Label className="text-xs">Razão social da empresa</Label>
          <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ex.: Elite Prime Hub" className="mt-1 h-9 text-sm" disabled={!loaded} />
        </div>
      )}
      <div>
        <Label className="text-xs">Instagram de atendimento</Label>
        <Input value={instagram} onChange={(e) => setInstagram(e.target.value)} placeholder="@seuperfil" className="mt-1 h-9 text-sm" disabled={!loaded} />
      </div>
      <p className="text-[11px] text-muted-foreground">
        Aparecem no contrato que o aluno aceita ao pagar o plano, junto com o WhatsApp para dúvidas. Com CNPJ, a empresa é a contratada e você aparece como responsável técnico (CREF).
      </p>
      <Button type="button" size="sm" variant="outline" onClick={save} disabled={!loaded || saving}>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salvar dados do contrato"}
      </Button>
    </div>
  );
}
