/**
 * PlansSettings.tsx — Admin edita preços e link externo dos planos do coach.
 * Armazenado em app_settings (key='coach_plans').
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Save, ExternalLink } from "lucide-react";

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

export const PlansSettings = () => {
  const [cfg, setCfg] = useState<PlansConfig>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "coach_plans")
        .maybeSingle();
      if (data?.value) setCfg({ ...DEFAULTS, ...(data.value as any) });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("app_settings")
      .upsert({
        key: "coach_plans",
        value: cfg as any,
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "key" });
    setSaving(false);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else toast.success("Configurações salvas");
  };

  if (loading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Planos do Coach</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="external_url">Link externo de pagamento</Label>
          <Input
            id="external_url"
            value={cfg.external_url}
            onChange={(e) => setCfg({ ...cfg, external_url: e.target.value })}
            placeholder="https://pay.kiwify.com.br/..."
          />
          {cfg.external_url && (
            <a
              href={cfg.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary mt-1 hover:underline"
            >
              <ExternalLink className="w-3 h-3" /> Abrir
            </a>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          <div>
            <Label htmlFor="monthly">Mensal</Label>
            <Input
              id="monthly"
              value={cfg.monthly_price}
              onChange={(e) => setCfg({ ...cfg, monthly_price: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="semester">Semestral</Label>
            <Input
              id="semester"
              value={cfg.semester_price}
              onChange={(e) => setCfg({ ...cfg, semester_price: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="annual">Anual</Label>
            <Input
              id="annual"
              value={cfg.annual_price}
              onChange={(e) => setCfg({ ...cfg, annual_price: e.target.value })}
            />
          </div>
        </div>

        <Button onClick={save} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Salvando…" : "Salvar"}
        </Button>
      </CardContent>
    </Card>
  );
};