/**
 * CoachDashboard.tsx — Painel completo do Coach
 *
 * REFATORAÇÃO Tarefa 8: componentes internos extraídos para
 * `src/components/coach/dashboard/`. Este arquivo agora orquestra
 * apenas roteamento, tabs, listagem de alunos e diálogos.
 */

import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  useCoachStudentsPaged, useCoachStudentsLite,
  type AlertLevel, type StudentStatus,
} from "@/hooks/useCoachStudents";
import {
  AlertTriangle, CheckCircle2, Search, Filter, Users,
  ArrowLeft, Loader2, DollarSign, User, LogOut, Activity, Sparkles,
} from "lucide-react";
import CoachNotificationBell from "@/components/coach/CoachNotificationBell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { ThemeToggle } from "@/components/ThemeToggle";

// Subcomponentes extraídos
import { StatCard, useCoachId, sb } from "@/components/coach/dashboard/dashboardUtils";
import { StudentRow } from "@/components/coach/dashboard/StudentRow";
import { PriorityQueuePanel } from "@/components/coach/dashboard/PriorityQueuePanel";
import { EvolutionDialog } from "@/components/coach/dashboard/EvolutionDialog";
import { StudentFeedbackConfigDialog } from "@/components/coach/dashboard/StudentFeedbackConfigDialog";
import { CheckinHistoryDialog } from "@/components/coach/dashboard/CheckinHistoryDialog";
import { FinancesTab } from "@/components/coach/dashboard/FinancesTab";
import { PartnersTab } from "@/components/coach/dashboard/PartnersTab";
import { ProfileDialog } from "@/components/coach/dashboard/ProfileDialog";
import { usePlatformBilling, worstPlatformStatus } from "@/hooks/usePlatformBilling";
import { PrivacyProvider, PrivacyToggle, Private } from "@/components/coach/PrivacyMode";

const ProtocolBuilder = lazy(() => import("@/components/coach/ProtocolBuilder"));
const CheckinFeedbackPanel = lazy(() => import("@/components/coach/CheckinFeedbackPanel"));
const StudentWorkoutAnalytics = lazy(() => import("@/components/coach/StudentWorkoutAnalytics"));
const ProtocolChangeHistoryDialog = lazy(() => import("@/components/coach/ProtocolChangeHistoryDialog"));

type CoachView = "list" | "protocol";

function CoachDashboardInner() {
  const coachId = useCoachId();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | AlertLevel>("all");
  const [view, setView] = useState<CoachView>("list");
  const [selectedStudent, setSelectedStudent] = useState<StudentStatus | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState<StudentStatus | null>(null);
  const [historyStudent, setHistoryStudent] = useState<StudentStatus | null>(null);
  const [changeHistoryStudent, setChangeHistoryStudent] = useState<StudentStatus | null>(null);
  const [evoStudent, setEvoStudent] = useState<StudentStatus | null>(null);
  const [latestFbStudent, setLatestFbStudent] = useState<StudentStatus | null>(null);
  const [settingsStudent, setSettingsStudent] = useState<StudentStatus | null>(null);
  const [studentPage, setStudentPage] = useState(0);
  const STUDENTS_PER_PAGE = 20;
  const [activeTab, setActiveTab] = useState<"students" | "finances" | "treinos" | "parcerias">("students");
  const [treinoSearch, setTreinoSearch] = useState("");
  const qc = useQueryClient();

  const { data: coachProfile } = useQuery({
    queryKey: ["coach-profile", coachId],
    enabled: !!coachId,
    queryFn: async () => {
      const { data } = await sb.from("profiles").select("feedback_interval_days, billing_alert_days").eq("user_id", coachId).maybeSingle();
      return data;
    },
  });

  const feedbackIntervalDays: number = (coachProfile as any)?.feedback_interval_days ?? 7;

  const {
    students: pagedStudents,
    filteredCount,
    stats,
    isLoading,
  } = useCoachStudentsPaged(coachId, feedbackIntervalDays, {
    page: studentPage,
    pageSize: STUDENTS_PER_PAGE,
    search,
    filter,
  });

  const totalPages = Math.max(1, Math.ceil(filteredCount / STUDENTS_PER_PAGE));
  const safePage = Math.min(studentPage, totalPages - 1);

  useEffect(() => { setStudentPage(0); }, [search, filter]);

  const { data: allStudents = [] } = useCoachStudentsLite(coachId);
  const { data: platformCharges = [] } = usePlatformBilling(coachId);
  const platformStatus = worstPlatformStatus(platformCharges);

  const goBack = () => { setView("list"); setSelectedStudent(null); };

  const confirmUnlink = async () => {
    if (!unlinkTarget) return;
    try {
      const { error } = await supabase.from("coach_students").update({ status: "inactive" }).eq("coach_id", coachId).eq("student_id", unlinkTarget.id);
      if (error) throw error;
      qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("coach-students") });
      toast.success("Aluno desvinculado");
      setUnlinkTarget(null);
    } catch (e) {
      toast.error("Erro ao desvincular: " + (e instanceof Error ? e.message : "erro desconhecido"));
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn("[handleLogout] Falha ao encerrar sessão no servidor:", e);
    } finally {
      window.location.href = "/auth";
    }
  };

  if (view !== "list" && selectedStudent) {
    return (
      <div className="min-h-screen bg-background">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={goBack}><ArrowLeft className="w-4 h-4" /></Button>
            <h1 className="text-sm font-bold text-foreground">
              {view === "protocol" ? "Protocolo" : ""} — <Private>{selectedStudent.name || "Aluno"}</Private>
            </h1>
          </div>
        </header>
        <main className="max-w-4xl mx-auto px-4 py-6">
          <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>}>
            {view === "protocol" && <ProtocolBuilder key={selectedStudent.id} studentId={selectedStudent.id} studentName={selectedStudent.name} />}
          </Suspense>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-foreground">Painel Coach</h1>
            <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
          <div className="flex items-center gap-2">
            <CoachNotificationBell />
            <PrivacyToggle />
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleLogout} className="text-muted-foreground hover:text-destructive h-9">
              <LogOut className="w-4 h-4 mr-1.5" /> Sair
            </Button>
            {stats.critical > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-900 dark:text-red-400 text-xs font-semibold px-2.5 py-1.5 rounded-lg">
                <AlertTriangle className="w-3.5 h-3.5" />
                {stats.critical} crítico{stats.critical > 1 ? "s" : ""}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={() => setShowProfile(true)} className="gap-1.5">
              <User className="w-3.5 h-3.5" /> Perfil
              {platformStatus && (
                <span
                  title={platformStatus === "blocked" ? "Assinatura da plataforma bloqueada" : "Assinatura da plataforma pendente"}
                  className={`ml-1 w-2 h-2 rounded-full ${platformStatus === "blocked" ? "bg-red-500" : "bg-amber-500"}`}
                />
              )}
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "students" | "finances" | "treinos" | "parcerias")} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="students" className="gap-1.5 text-xs sm:text-sm"><Users className="w-3.5 h-3.5" /> Alunos</TabsTrigger>
            <TabsTrigger value="finances" className="gap-1.5 text-xs sm:text-sm"><DollarSign className="w-3.5 h-3.5" /> Financeiro</TabsTrigger>
            <TabsTrigger value="treinos" className="gap-1.5 text-xs sm:text-sm"><Activity className="w-3.5 h-3.5" /> Treinos</TabsTrigger>
            <TabsTrigger value="parcerias" className="gap-1.5 text-xs sm:text-sm"><Sparkles className="w-3.5 h-3.5" /> Parcerias</TabsTrigger>
          </TabsList>

          <TabsContent value="students" className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Total de alunos"   value={stats.total}    icon={<Users className="w-4 h-4" />}        accent="#3B82F6" />
              <StatCard label="Em alerta crítico" value={stats.critical} icon={<AlertTriangle className="w-4 h-4" />} accent="#EF4444" />
              <StatCard label="Precisam atenção"  value={stats.warning}  icon={<AlertTriangle className="w-4 h-4" />} accent="#F59E0B" />
              <StatCard label="Em dia"            value={stats.ok}       icon={<CheckCircle2 className="w-4 h-4" />}  accent="#10B981" />
            </div>

            {coachId && (
              <PriorityQueuePanel
                coachId={coachId}
                students={allStudents}
                onSelectStudent={(sid, source) => {
                  // Cobrança em atraso não é assunto de check-in: leva o coach
                  // direto para a aba Financeiro.
                  if (source === "payment_overdue") { setActiveTab("finances"); return; }
                  // Tanto 'fatigue' quanto 'checkin_urgent' são sobre o check-in
                  // do aluno → abre direto o mesmo painel de feedback usado na
                  // StudentRow ("Último check-in").
                  const st = allStudents.find((s) => s.id === sid);
                  if (!st) return;
                  const full = pagedStudents.find((s) => s.id === sid);
                  setLatestFbStudent(
                    full ?? ({
                      id: st.id, name: st.name, alertLevel: "ok", daysInactive: 0,
                      daysSinceLastFeedback: 0, currentWeight: null, lastFeedback: null,
                    } as any)
                  );
                }}
              />
            )}

            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar aluno..." className="pl-8 h-9 text-sm" />
              </div>
              <Select value={filter} onValueChange={(v) => setFilter(v as "all" | AlertLevel)}>
                <SelectTrigger className="w-36 h-9 text-sm">
                  <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Filtrar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="critical">Crítico</SelectItem>
                  <SelectItem value="warning">Atenção</SelectItem>
                  <SelectItem value="ok">Em dia</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("coach-students") })}
                className="h-9"
                title="Atualizar lista"
              >
                Atualizar
              </Button>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
            ) : filteredCount === 0 ? (
              <div className="text-center py-12">
                <Users className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">
                  {stats.total === 0 ? "Nenhum aluno vinculado ainda. Compartilhe seu código de convite." : "Nenhum aluno encontrado com os filtros atuais."}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {pagedStudents.map((s) => (
                  <StudentRow key={s.id} student={s}
                    onAnamnesis={(st) => setEvoStudent(st)}
                    onProtocol={(st) => { setSelectedStudent(st); setView("protocol"); }}
                    onUnlink={setUnlinkTarget}
                    onHistory={setHistoryStudent}
                    onChangeHistory={setChangeHistoryStudent}
                    onLatestFeedback={(st) => setLatestFbStudent(st)}
                    onSettings={(st) => setSettingsStudent(st)}
                  />
                ))}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-3">
                    <Button size="sm" variant="outline" disabled={safePage <= 0} onClick={() => setStudentPage((p) => Math.max(0, p - 1))}>← Anterior</Button>
                    <p className="text-xs text-muted-foreground">Página {safePage + 1} de {totalPages}</p>
                    <Button size="sm" variant="outline" disabled={safePage >= totalPages - 1} onClick={() => setStudentPage((p) => p + 1)}>Próxima →</Button>
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="finances">
            {coachId && <FinancesTab coachId={coachId} students={allStudents} />}
          </TabsContent>

          <TabsContent value="parcerias">
            <PartnersTab coachId={coachId} />
          </TabsContent>

          <TabsContent value="treinos" className="space-y-4">
            {allStudents.length > 8 && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  value={treinoSearch}
                  onChange={(e) => setTreinoSearch(e.target.value)}
                  placeholder="Buscar aluno..."
                  className="pl-8 h-9 text-sm"
                />
              </div>
            )}
            <div className="flex gap-2 flex-wrap">
              {(() => {
                const norm = (v: string) => (v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                const q = norm(treinoSearch.trim());
                const list = q ? allStudents.filter((s) => norm(s.name || "").includes(q)) : allStudents;
                return list.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStudent(allStudents.find((st) => st.id === s.id) ? { id: s.id, name: s.name, alertLevel: "ok", daysInactive: 0, daysSinceLastFeedback: 999, currentWeight: undefined, lastWeightDate: undefined } as any : null)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border transition"
                  style={
                    selectedStudent?.id === s.id
                      ? { background: "hsl(var(--primary) / 0.15)", borderColor: "hsl(var(--primary) / 0.5)", color: "hsl(var(--primary))" }
                      : { background: "transparent", borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }
                  }
                >
                  <Private>{s.name}</Private>
                </button>
                ));
              })()}
            </div>
            {selectedStudent && coachId ? (
              <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}>
                <StudentWorkoutAnalytics
                  studentId={selectedStudent.id}
                  studentName={selectedStudent.name}
                  coachId={coachId}
                />
              </Suspense>
            ) : (
              <div className="text-center py-12 text-sm text-muted-foreground">
                <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
                {allStudents.length === 0
                  ? "Nenhum aluno vinculado ainda."
                  : "Selecione um aluno acima para ver os dados de treino."}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {coachId && <ProfileDialog coachId={coachId} open={showProfile} onClose={() => setShowProfile(false)} />}

        <AlertDialog open={!!unlinkTarget} onOpenChange={(o) => !o && setUnlinkTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desvincular aluno?</AlertDialogTitle>
              <AlertDialogDescription><Private>{unlinkTarget?.name}</Private> perderá acesso ao protocolo.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmUnlink} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Desvincular</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <CheckinHistoryDialog
          student={historyStudent}
          open={!!historyStudent}
          onClose={() => setHistoryStudent(null)}
        />

        <Suspense fallback={null}>
          <ProtocolChangeHistoryDialog
            student={changeHistoryStudent}
            open={!!changeHistoryStudent}
            onClose={() => setChangeHistoryStudent(null)}
          />
        </Suspense>

        <EvolutionDialog
          student={evoStudent}
          open={!!evoStudent}
          onClose={() => setEvoStudent(null)}
        />

        <Suspense fallback={null}>
          <CheckinFeedbackPanel
            student={latestFbStudent}
            open={!!latestFbStudent}
            onClose={() => setLatestFbStudent(null)}
          />
        </Suspense>

        <StudentFeedbackConfigDialog
          student={settingsStudent}
          coachId={coachId}
          open={!!settingsStudent}
          onClose={() => setSettingsStudent(null)}
          onSaved={() => qc.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("coach-students") })}
        />
      </main>
    </div>
  );
}

// Modo Privacidade envolve todo o painel do coach (inclui diálogos em portal).
export default function CoachDashboard() {
  return (
    <PrivacyProvider>
      <CoachDashboardInner />
    </PrivacyProvider>
  );
}
