/**
 * CoachGuard.tsx — Bloqueia o painel do coach quando:
 *  1. O trial de 30 dias acabou
 *  2. O admin bloqueou manualmente (blocked_until no futuro)
 *
 * Admins passam direto. Coaches com trial_ends_at no futuro e sem blocked_until também passam.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles, Ban } from "lucide-react";

interface Props {
  children: React.ReactNode;
}

export const CoachGuard = ({ children }: Props) => {
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState<"trial" | "manual" | null>(null);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (mounted) setLoading(false); return; }

      const { data: isAdmin } = await supabase.rpc("has_role", {
        _user_id: user.id, _role: "admin",
      });
      if (isAdmin) { if (mounted) { setBlocked(false); setLoading(false); } return; }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: profile } = await supabase
        .from("profiles")
        .select("trial_ends_at, blocked_until")
        .eq("user_id", user.id)
        .maybeSingle() as any;

      const now = new Date();

      // Checa bloqueio manual (maior prioridade)
      if (profile?.blocked_until) {
        const until = new Date(profile.blocked_until);
        if (until > now) {
          if (mounted) {
            setBlocked(true);
            setBlockReason("manual");
            setBlockedUntil(until);
            setLoading(false);
          }
          return;
        }
      }

      // Checa trial
      const trialEnds = profile?.trial_ends_at ? new Date(profile.trial_ends_at) : null;
      if (!trialEnds) {
        if (mounted) { setBlocked(false); setLoading(false); }
        return;
      }

      const diffMs = trialEnds.getTime() - now.getTime();
      const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (mounted) {
        setDaysLeft(days);
        if (diffMs <= 0) {
          setBlocked(true);
          setBlockReason("trial");
        } else {
          setBlocked(false);
        }
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

  // Bloqueio manual
  if (blockReason === "manual") {
    const formattedDate = blockedUntil
      ? blockedUntil.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
      : "data indefinida";

    return (
      <div className="relative min-h-screen">
        <div className="absolute inset-0 blur-sm pointer-events-none select-none opacity-40">
          {children}
        </div>
        <div className="relative z-10 min-h-screen flex items-center justify-center px-4">
          <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center shadow-2xl">
            <div className="w-14 h-14 mx-auto rounded-full bg-destructive/15 flex items-center justify-center mb-4">
              <Ban className="w-7 h-7 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Acesso Suspenso</h1>
            <p className="text-muted-foreground mb-2">
              Seu acesso foi suspenso pelo administrador até:
            </p>
            <p className="text-lg font-bold text-destructive mb-6">{formattedDate}</p>
            <p className="text-sm text-muted-foreground">
              Entre em contato com o suporte para mais informações.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Trial expirado
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
            Você teve 30 dias gratuitos para conhecer o Elite Prime <span className="text-primary font-semibold">Hub</span>.
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
