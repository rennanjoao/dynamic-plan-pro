// Tela única de aceite para quem já era aluno antes do consentimento existir
// (ou quando o texto muda de versão). Aparece uma vez; depois o app segue igual.
import { useState } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConsentFields } from "@/components/legal/ConsentFields";
import { consentIssue, recordConsent } from "@/lib/consent";

export function ConsentGate({ userId, minor, onDone }: { userId: string; minor: boolean; onDone: () => void }) {
  const [value, setValue] = useState({ accepted: false, minor, guardianName: "", guardianAccepted: false });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const issue = consentIssue({ ...value, minor });
    if (issue) { setError(issue); return; }
    setSaving(true); setError("");
    try {
      await recordConsent(userId, { guardianName: minor ? value.guardianName : null });
      onDone();
    } catch {
      setError("Não foi possível registrar agora. Confira a internet e tente de novo.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background p-6">
      <div className="max-w-md w-full space-y-5 rounded-2xl border border-border bg-card p-6">
        <div className="space-y-2 text-center">
          <ShieldCheck className="w-10 h-10 text-primary mx-auto" aria-hidden="true" />
          <h1 className="text-xl font-bold text-foreground">Sua privacidade</h1>
          <p className="text-sm text-muted-foreground">
            Para seguir usando o app, precisamos da sua autorização para usar seus dados de saúde e fotos no seu protocolo. É só uma vez.
          </p>
        </div>
        <ConsentFields value={{ ...value, minor }} onChange={setValue} />
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button size="lg" className="w-full h-12 font-bold" onClick={submit} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Continuar"}
        </Button>
      </div>
    </div>
  );
}
