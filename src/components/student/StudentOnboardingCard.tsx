/**
 * StudentOnboardingCard — passo a passo único do primeiro acesso à área do
 * aluno. Lê/grava apenas profiles.onboarding_seen_at. A marcação acontece no
 * mount do card (não no clique de fechar), então ele nunca reaparece — mesmo
 * que o aluno saia da tela sem tocar em nada.
 */
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CalendarClock, MessageCircle, HelpCircle } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb: any = supabase;

export function StudentOnboardingCard({ userId }: { userId: string | null }) {
  const [open, setOpen] = useState(false);
  const checked = useRef(false);

  useEffect(() => {
    if (!userId || checked.current) return;
    checked.current = true;
    (async () => {
      const { data } = await sb
        .from("profiles")
        .select("onboarding_seen_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (!data || data.onboarding_seen_at) return;
      setOpen(true);
      // Grava já no mount do card — evita reaparecer em outro aparelho.
      await sb.from("profiles").update({ onboarding_seen_at: new Date().toISOString() }).eq("user_id", userId);
    })();
  }, [userId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Bem-vindo à sua Área do Aluno</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex gap-3">
            <CalendarClock className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Seu protocolo é atualizado em até <strong className="text-foreground">7 dias</strong>.
            </p>
          </div>
          <div className="flex gap-3">
            <MessageCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              A IA também pode te ajudar! Use o botão de Chat para obter suporte sobre seu protocolo instantaneamente.
            </p>
          </div>
          <div className="flex gap-3">
            <HelpCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              Para falar direto com seu coach, use o botão <strong className="text-foreground">“Tenho uma dúvida”</strong> nas telas de
              Treino, Dieta e Suplementos.
            </p>
          </div>
          <Button className="w-full" onClick={() => setOpen(false)}>Entendi</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default StudentOnboardingCard;
