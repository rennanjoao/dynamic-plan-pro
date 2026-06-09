import { Card } from "@/components/ui/card";
import { DollarSign } from "lucide-react";

/**
 * CoachBillingPanel — placeholder do painel de cobrança em massa.
 * Substitua/expanda quando o fluxo de disparo via WhatsApp/Email estiver pronto.
 */
const CoachBillingPanel = () => {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2 mb-2">
        <DollarSign className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-semibold">Cobrança em Massa</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Painel de disparo de cobranças em desenvolvimento. Use a aba abaixo para configurar os preços dos planos.
      </p>
    </Card>
  );
};

export default CoachBillingPanel;