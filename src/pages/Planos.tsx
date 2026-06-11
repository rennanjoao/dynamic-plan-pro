/**
 * Planos.tsx — Página pública de planos para coaches.
 *
 * Os preços e o link de pagamento externo são lidos de `app_settings.coach_plans`.
 * Admin edita pelo painel Admin > Configurações.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Check, ArrowLeft } from "lucide-react";

interface PlansConfig {
  external_url: string;
  monthly_price: string;
  semester_price: string;
  annual_price: string;
}

const DEFAULTS: PlansConfig = {
  external_url: "",
  monthly_price: "R$ 20,00",
  semester_price: "R$ 108,00",
  annual_price: "R$ 192,00",
};

const FEATURES = [
  "Alunos ilimitados",
  "Anamnese completa + check-ins",
  "Protocolos e rotinas dinâmicas",
  "Mentor IA para os alunos",
  "Exportação de protocolos",
  "Suporte prioritário",
];

export default function Planos() {
  const [cfg, setCfg] = useState<PlansConfig>(DEFAULTS);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "coach_plans")
        .maybeSingle();
      if (data?.value) setCfg({ ...DEFAULTS, ...(data.value as any) });
    })();
  }, []);

  const openExternal = () => {
    if (cfg.external_url) window.open(cfg.external_url, "_blank", "noopener,noreferrer");
  };

  const plans = [
    { name: "Mensal",    price: cfg.monthly_price,  period: "/mês",       highlight: false },
    { name: "Semestral", price: cfg.semester_price, period: "/6 meses",   highlight: true, badge: "Mais popular" },
    { name: "Anual",     price: cfg.annual_price,   period: "/ano",       highlight: false, badge: "Maior economia" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl mx-auto px-4 py-10">
        <Link to="/coach" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6">
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
        </Link>

        <header className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold mb-3">
            Elite Prime <span className="text-primary">Hub</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Escolha o plano que melhor encaixa na sua rotina de acompanhamento.
          </p>
        </header>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((p) => (
            <div
              key={p.name}
              className={`relative rounded-2xl border p-6 flex flex-col ${
                p.highlight
                  ? "border-primary bg-card shadow-[0_0_30px_-12px_hsl(var(--primary)/0.6)]"
                  : "border-border bg-card"
              }`}
            >
              {p.badge && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs px-3 py-1 rounded-full font-semibold">
                  {p.badge}
                </span>
              )}
              <h3 className="text-xl font-semibold mb-1">{p.name}</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-3xl font-bold">{p.price}</span>
                <span className="text-sm text-muted-foreground">{p.period}</span>
              </div>
              <ul className="space-y-2 mb-6 flex-1">
                {FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={openExternal}
                disabled={!cfg.external_url}
                variant={p.highlight ? "default" : "outline"}
                className="w-full"
              >
                {cfg.external_url ? "Assinar agora" : "Em breve"}
              </Button>
            </div>
          ))}
        </div>

        {!cfg.external_url && (
          <p className="text-center text-sm text-muted-foreground mt-8">
            O link de pagamento ainda não foi configurado. Entre em contato com o suporte.
          </p>
        )}
      </div>
    </div>
  );
}