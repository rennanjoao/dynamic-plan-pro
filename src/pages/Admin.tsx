import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut, Users, Link2, DollarSign, Activity, User, Dumbbell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { TrainerManagement } from "@/components/admin/TrainerManagement";
import { ExerciseLibraryUploader } from "@/components/admin/ExerciseLibraryUploader";
import { AdminExerciseManager } from "@/components/admin/AdminExerciseManager";
import { ExerciseMuscleGroupReviewQueue } from "@/components/admin/ExerciseMuscleGroupReviewQueue";
import { StudentLinksManagement } from "@/components/admin/StudentLinksManagement";
import { PlansSettings } from "@/components/admin/PlansSettings";
import { AccessLogPanel } from "@/components/admin/AccessLogPanel";
import CoachBillingPanel from "@/components/admin/CoachBillingPanel";
import { AdminPasswordManager } from "@/components/admin/AdminPasswordManager";
import { SimpleProfileDialog } from "@/components/SimpleProfileDialog";

const Admin = () => {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id || null));
  }, []);

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
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-2 text-white/90 hover:text-white hover:bg-white/10"
          >
            <User className="w-5 h-5" />
            <span className="hidden sm:inline">Perfil</span>
          </Button>
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
          Treinadores, vínculos, financeiro e alertas
        </p>
      </header>

      <div className="max-w-6xl mx-auto px-6 mt-10">
        <Tabs defaultValue="trainers" className="w-full">
          <TabsList className="flex flex-wrap h-auto gap-2 justify-start mb-6">
            <TabsTrigger value="trainers" className="gap-1.5"><Users className="w-4 h-4" /> Profissionais</TabsTrigger>
            <TabsTrigger value="links" className="gap-1.5"><Link2 className="w-4 h-4" /> Vínculos</TabsTrigger>
            <TabsTrigger value="billing" className="gap-1.5"><DollarSign className="w-4 h-4" /> Cobrança</TabsTrigger>
            <TabsTrigger value="access" className="gap-1.5"><Activity className="w-4 h-4" /> Acessos e Senhas</TabsTrigger>
            <TabsTrigger value="exercise-library" className="gap-1.5"><Dumbbell className="w-4 h-4" /> Biblioteca</TabsTrigger>
          </TabsList>

          <TabsContent value="trainers">
            <TrainerManagement />
          </TabsContent>

          <TabsContent value="links">
            <StudentLinksManagement />
          </TabsContent>

          <TabsContent value="billing" className="space-y-6">
            {/* Painel de disparo para o WhatsApp */}
            <CoachBillingPanel />
            {/* Configurações de preço dos planos */}
            <PlansSettings />
          </TabsContent>

          <TabsContent value="access" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-semibold mb-4">Monitoramento de Acesso</h2>
              <AccessLogPanel />
            </div>
            <AdminPasswordManager />
          </TabsContent>

          <TabsContent value="exercise-library" className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-semibold mb-4">Biblioteca de GIFs de Exercícios</h2>
              <ExerciseLibraryUploader />
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-semibold mb-1">Exercícios cadastrados</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Visualize a mídia de cada exercício antes de renomear — clique em um item para editar o nome de exibição.
              </p>
              <AdminExerciseManager />
            </div>
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="text-lg font-semibold mb-1">Fila de revisão de grupo muscular</h2>
              <p className="text-xs text-muted-foreground mb-4">
                Exercícios que o classificador automático não reconheceu, ou que o coach clicou em "Pular".
                Escolher o grupo aqui resolve o exercício para todos os protocolos futuros.
              </p>
              <ExerciseMuscleGroupReviewQueue />
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {userId && (
        <SimpleProfileDialog userId={userId} open={showProfile} onClose={() => setShowProfile(false)} />
      )}
    </div>
  );
};

export default Admin;
