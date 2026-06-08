import { useNavigate, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

// Rotas que possuem seu próprio header (não precisam do overlay global).
const ROUTES_WITH_OWN_HEADER = new Set<string>([
  "/",
  "/auth",
  "/admin-login",
  "/anamnesis",
  "/student",
  "/student-area",
  "/fitness",
  "/check-in",
  "/evolution",
  "/routine",
  "/workout-plan",
  "/supplements",
  "/coach",
  "/admin",
  "/shopping-list",
]);

export const NavigationControls = () => {
  const navigate = useNavigate();
  const location = useLocation();

  if (ROUTES_WITH_OWN_HEADER.has(location.pathname)) return null;

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="sticky top-0 z-50 w-full bg-background/80 backdrop-blur border-b border-border">
      <div className="max-w-3xl mx-auto px-3 py-2 flex items-center justify-end">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleLogout}
          className="h-8 px-2 gap-1 text-destructive hover:bg-destructive/10"
        >
          <LogOut className="h-4 w-4" />
          <span className="text-xs">Sair</span>
        </Button>
      </div>
    </div>
  );
};
