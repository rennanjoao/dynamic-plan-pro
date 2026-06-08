import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

import { TrainerManagement } from "@/components/admin/TrainerManagement";
import { StudentLinksManagement } from "@/components/admin/StudentLinksManagement";
import { AlertManager } from "@/components/admin/AlertManager";
import { PlansSettings } from "@/components/admin/PlansSettings";
import { AccessLogPanel } from "@/components/admin/AccessLogPanel";

const Admin = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen pb-12 bg-background">
      <header className="gradient-primary text-white py-10 px-6 text-center relative shadow-lg">
        <Link
          to="/"
          className="absolute left-6 top-6 flex items-center gap-2 text-white/90 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
          Voltar
        </Link>

        <div className="absolute right-6 top-6 flex items-center gap-1">
          <ThemeToggle className="text-white/90 hover:text-white hover:bg-white/10" />
          <Button
            variant="ghost"
            onClick={handleLogout}
            className="flex items-center gap-2 text-white/90 hover:text-white hover:bg-white/10"
          >
            <LogOut className="w-5 h-5" />
            Sair
          </Button>
        </div>

        <h1 className="text-3xl md:text-4xl font-bold mb-1">
          Painel Admin
        </h1>
        <p className="text-sm md:text-base opacity-90">
          Treinadores, vínculos e alertas
        </p>
      </header>

      <div className="max-w-5xl mx-auto px-6 mt-10 space-y-6">
        <TrainerManagement />
        <StudentLinksManagement />
        <AlertManager />
        <PlansSettings />

        {/* Monitoramento de acesso */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Monitoramento de Acesso</h2>
          <AccessLogPanel />
        </div>
      </div>
    </div>
  );
};

export default Admin;
