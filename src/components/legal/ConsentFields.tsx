// Caixa de consentimento LGPD (dados de saúde e fotos), destacada e nunca
// pré-marcada. Para menor de 18 anos, pede também o responsável legal.
import { CONSENT_TEXT, GUARDIAN_CONSENT_TEXT, type ConsentState } from "@/lib/consent";

export function ConsentFields({ value, onChange }: { value: ConsentState; onChange: (v: ConsentState) => void }) {
  return (
    <div className="rounded-xl border-2 border-primary/50 bg-primary/5 p-4 space-y-3" data-testid="consent-box">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          name="consent"
          checked={value.accepted}
          onChange={(e) => onChange({ ...value, accepted: e.target.checked })}
          className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
          aria-describedby="consent-links"
        />
        <span className="text-sm font-semibold text-foreground">{CONSENT_TEXT}</span>
      </label>
      {value.minor && (
        <div className="space-y-2 border-t border-primary/20 pt-3">
          <p className="text-xs text-muted-foreground">Pela data de nascimento, o aluno tem menos de 18 anos. O responsável legal precisa autorizar.</p>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">Nome completo do responsável</span>
            <input
              name="guardian_name"
              value={value.guardianName}
              onChange={(e) => onChange({ ...value, guardianName: e.target.value })}
              autoComplete="name"
              className="h-11 rounded-lg border border-border bg-background px-3 text-sm"
            />
          </label>
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="guardian_consent"
              checked={value.guardianAccepted}
              onChange={(e) => onChange({ ...value, guardianAccepted: e.target.checked })}
              className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
            />
            <span className="text-sm text-foreground">{GUARDIAN_CONSENT_TEXT}</span>
          </label>
        </div>
      )}
      <p id="consent-links" className="text-xs text-muted-foreground">
        Veja a{" "}
        <a href="/privacidade" target="_blank" rel="noopener noreferrer" className="underline text-primary">Política de Privacidade</a>
        {" "}e os{" "}
        <a href="/termos" target="_blank" rel="noopener noreferrer" className="underline text-primary">Termos de Uso</a>.
      </p>
    </div>
  );
}
