import { Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AdminGuard } from "./components/admin/AdminGuard";
import { AnamnesisGuard } from "./components/student/AnamnesisGuard";
import { CoachGuard } from "./components/coach/CoachGuard";
import { NavigationControls } from "@/components/NavigationControls";
import { GlobalAIAssistant } from "@/components/GlobalAIAssistant";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { supabase } from "@/integrations/supabase/client";
import { PageLoader } from "@/components/ui/PageLoader";

const Index        = lazyWithRetry(() => import("./pages/Index"));
const Admin        = lazyWithRetry(() => import("./pages/Admin"));
const AdminLogin   = lazyWithRetry(() => import("./pages/AdminLogin"));
const Auth         = lazyWithRetry(() => import("./pages/Auth"));
const ResetPassword= lazyWithRetry(() => import("./pages/ResetPassword"));
const StudentArea  = lazyWithRetry(() => import("./pages/StudentArea"));
const NotFound     = lazyWithRetry(() => import("./pages/NotFound"));

const CoachDashboard   = lazyWithRetry(() => import("./pages/CoachDashboard"));
const CoachRegister    = lazyWithRetry(() => import("./pages/CoachRegister"));
const Anamnesis        = lazyWithRetry(() => import("./pages/Anamnesis"));
const CheckIn          = lazyWithRetry(() => import("./pages/CheckIn"));
const Evolution        = lazyWithRetry(() => import("./pages/Evolution"));
const DynamicRoutine   = lazyWithRetry(() => import("./pages/DynamicRoutine"));
const WorkoutPlanPage  = lazyWithRetry(() => import("./pages/WorkoutPlan"));
const Supplements      = lazyWithRetry(() => import("./pages/Supplements"));
const Planos           = lazyWithRetry(() => import("./pages/Planos"));
const ShoppingList     = lazyWithRetry(() => import("./pages/ShoppingList"));

// Nova página de Referral
const ReferralWelcome  = lazyWithRetry(() => import("./pages/ReferralWelcome"));
const PartnerArea      = lazyWithRetry(() => import("./pages/PartnerArea"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthCacheGuard() {
  useEffect(() => {
    let knownUserId: string | null | undefined;
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      if (knownUserId !== undefined && uid !== knownUserId) {
        queryClient.clear();
      }
      knownUserId = uid;
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  return null;
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthCacheGuard />
      <TooltipProvider>
        <ConfirmProvider>
          <Toaster />
          <Sonner />

          <BrowserRouter>
          <NavigationControls />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Públicas */}
              <Route path="/"            element={<ErrorBoundary label="Algo deu errado. Recarregue a página."><Index /></ErrorBoundary>} />
              <Route path="/auth"        element={<ErrorBoundary label="Algo deu errado. Recarregue a página."><Auth /></ErrorBoundary>} />
              <Route path="/admin-login" element={<ErrorBoundary label="Algo deu errado. Recarregue a página."><AdminLogin /></ErrorBoundary>} />
              <Route path="/reset-password" element={<ErrorBoundary label="Algo deu errado. Recarregue a página."><ResetPassword /></ErrorBoundary>} />
              <Route path="/register"    element={<ErrorBoundary label="Algo deu errado. Recarregue a página."><CoachRegister /></ErrorBoundary>} />

              {/* Rota de Referral (Landing Page de Convite) */}
              <Route path="/c/:coachId"  element={<ErrorBoundary label="Algo deu errado. Recarregue a página."><ReferralWelcome /></ErrorBoundary>} />

              {/* Redirects de rotas antigas — mantém links antigos funcionando */}
              <Route path="/student"  element={<Navigate to="/student-area" replace />} />
              <Route path="/fitness"  element={<Navigate to="/student-area" replace />} />
              <Route path="/daily"    element={<Navigate to="/student-area" replace />} />

              {/* Porta de entrada (novo cadastro) */}
              <Route path="/anamnesis" element={<ErrorBoundary label="Algo deu errado. Recarregue a página."><Anamnesis /></ErrorBoundary>} />

              {/* Aluno autenticado */}
              <Route path="/student-area"  element={<ErrorBoundary label="Erro na área do aluno. Recarregue."><AnamnesisGuard><StudentArea /></AnamnesisGuard></ErrorBoundary>} />
              <Route path="/check-in"      element={<ErrorBoundary label="Erro na área do aluno. Recarregue."><AnamnesisGuard><CheckIn /></AnamnesisGuard></ErrorBoundary>} />
              <Route path="/evolution"     element={<ErrorBoundary label="Erro na área do aluno. Recarregue."><AnamnesisGuard><Evolution /></AnamnesisGuard></ErrorBoundary>} />
              <Route path="/routine"       element={<ErrorBoundary label="Erro na área do aluno. Recarregue."><AnamnesisGuard><DynamicRoutine /></AnamnesisGuard></ErrorBoundary>} />
              <Route path="/workout-plan"  element={<ErrorBoundary label="Erro na área do aluno. Recarregue."><AnamnesisGuard><WorkoutPlanPage /></AnamnesisGuard></ErrorBoundary>} />
              <Route path="/supplements"   element={<ErrorBoundary label="Erro na área do aluno. Recarregue."><AnamnesisGuard><Supplements /></AnamnesisGuard></ErrorBoundary>} />
              <Route path="/shopping-list" element={<ErrorBoundary label="Erro na área do aluno. Recarregue."><AnamnesisGuard><ShoppingList /></AnamnesisGuard></ErrorBoundary>} />

              {/* Coach */}
              <Route path="/parceria" element={<ErrorBoundary label="Erro na área de parceria. Recarregue."><PartnerArea /></ErrorBoundary>} />
              <Route path="/coach"  element={<ErrorBoundary label="Erro na área do coach. Recarregue."><AdminGuard requiredRole="coach"><CoachGuard><CoachDashboard /></CoachGuard></AdminGuard></ErrorBoundary>} />
              <Route path="/planos" element={<ErrorBoundary label="Algo deu errado. Recarregue a página."><Planos /></ErrorBoundary>} />

              {/* Admin */}
              <Route path="/admin" element={<ErrorBoundary label="Erro na área administrativa. Recarregue."><AdminGuard><Admin /></AdminGuard></ErrorBoundary>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>

          {/* Assistente de IA global (todas as rotas autenticadas) */}
          <GlobalAIAssistant />

          {/* Banner de instalação PWA */}
          <PWAInstallPrompt />
          </BrowserRouter>
        </ConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
