/**
 * CoachGuard.tsx — Bloqueia o painel do coach quando o trial de 30 dias acabou.
 *
 * Admins passam direto. Coaches com trial_ends_at no futuro também passam.
 * Caso contrário, mostra overlay desfocado com CTA para /planos.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

export const CoachGuard = ({ children }: Props) => {
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (mounted) setLoading(false); return; }

      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: user.id, _role: "admin",
      });
      if (isAdmin) { if (mounted) { setBlocked(false); setLoading(false); } return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("trial_ends_at")
        .eq("user_id", user.id)
        .maybeSingle();

      const trialEnds = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
      const now = new Date();

      if (!trialEnds) {
        if (mounted) { setBlocked(false); setLoading(false); }
        return;
      }

      const diffMs = trialEnds.getTime() - now.getTime();
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (mounted) {
        setDaysLeft(days);
        setBlocked(diffMs <= 0);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!blocked) {
    return (
      <>
        {daysLeft !== null && daysLeft <= 7 && daysLeft > 0 && (
          <div className="bg-primary/10 border-b border-primary/30 px-4 py-2 text-center text-sm">
            <Sparkles className="inline w-4 h-4 mr-1 text-primary" />
            Seu trial termina em <strong className="text-primary">{daysLeft} {daysLeft === 1 ? "dia" : "dias"}</strong>.{" "}
            <Link to="/planos" className="underline text-primary">Ver planos</Link>
          </div>
        )}
        {children}
      </>
    );
  }

  return (
    <div className="relative min-h-screen">
      <div className="absolute inset-0 blur-sm pointer-events-none select-none opacity-40">
        {children}
      </div>
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-14 h-14 mx-auto rounded-full bg-primary/15 flex items-center justify-center mb-4">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Seu trial terminou</h1>
          <p className="text-muted-foreground mb-6">
            Você teve 30 dias gratuitos para conhecer o Elite Lab <span className="text-primary font-semibold">Hub</span>.
            Para continuar acompanhando seus alunos, escolha um plano.
          </p>
          <Button asChild className="w-full" size="lg">
            <Link to="/planos">Ver planos disponíveis</Link>
          </Button>
        </div>
      </div>
    </div>
  );
};