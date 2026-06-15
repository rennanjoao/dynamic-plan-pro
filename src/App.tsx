import { Suspense } from "react";
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
import { lazyWithRetry } from "@/lib/lazyWithRetry";

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

function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

const App = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />

        <BrowserRouter>
          <NavigationControls />
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Públicas */}
              <Route path="/"            element={<Index />} />
              <Route path="/auth"        element={<Auth />} />
              <Route path="/admin-login" element={<AdminLogin />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/register"    element={<CoachRegister />} />

              {/* Redirects de rotas antigas — mantém links antigos funcionando */}
              <Route path="/student"  element={<Navigate to="/student-area" replace />} />
              <Route path="/fitness"  element={<Navigate to="/student-area" replace />} />
              <Route path="/daily"    element={<Navigate to="/student-area" replace />} />

              {/* Porta de entrada (novo cadastro) */}
              <Route path="/anamnesis" element={<Anamnesis />} />

              {/* Aluno autenticado */}
              <Route path="/student-area"  element={<AnamnesisGuard><StudentArea /></AnamnesisGuard>} />
              <Route path="/check-in"      element={<AnamnesisGuard><CheckIn /></AnamnesisGuard>} />
              <Route path="/evolution"     element={<AnamnesisGuard><Evolution /></AnamnesisGuard>} />
              <Route path="/routine"       element={<AnamnesisGuard><DynamicRoutine /></AnamnesisGuard>} />
              <Route path="/workout-plan"  element={<AnamnesisGuard><WorkoutPlanPage /></AnamnesisGuard>} />
              <Route path="/supplements"   element={<AnamnesisGuard><Supplements /></AnamnesisGuard>} />
              <Route path="/shopping-list" element={<AnamnesisGuard><ShoppingList /></AnamnesisGuard>} />

              {/* Coach */}
              <Route path="/coach"  element={<AdminGuard requiredRole="coach"><CoachGuard><CoachDashboard /></CoachGuard></AdminGuard>} />
              <Route path="/planos" element={<Planos />} />

              {/* Admin */}
              <Route path="/admin" element={<AdminGuard><Admin /></AdminGuard>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>

          {/* Assistente de IA global (todas as rotas autenticadas) */}
          <GlobalAIAssistant />

          {/* Banner de instalação PWA */}
          <PWAInstallPrompt />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;
