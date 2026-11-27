/**
 * Ficha do aluno — tudo de um aluno num lugar só (decisão do coach: "ficha
 * completa"). Antes cada coisa ficava numa tela: Evolução escondida no item
 * "Anamnese", Treinos em outra aba do painel, Engajamento e Histórico em
 * janelas separadas. As abas reaproveitam as telas que já existiam.
 *
 * No celular ocupa a tela inteira; as abas rolam na horizontal.
 *
 * Postura: a aba usa a "postura rápida" (posture_quick_checks). O módulo
 * completo de avaliação postural (src/components/coach/posture/PostureAssessment*,
 * usePostureAssessments, tabela posture_assessments) segue no código, fora da
 * tela, por decisão do coach (longo demais para o dia a dia).
 */
import { SectionSkeleton } from "@/components/coach/CoachSkeletons";
import { Suspense, useEffect, useState } from "react";
import { Loader2, MessageSquareReply, Dumbbell, Eye, Settings2 } from "lucide-react";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import type { StudentStatus } from "@/hooks/useCoachStudents";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Private } from "@/components/coach/PrivacyMode";
import { AlertBadge, ClinicalSignalBadge, InsightBadge, WeightTrendBadge } from "./dashboardUtils";
import { CheckinHistoryList } from "./CheckinHistoryDialog";
import { StudentEngagementContent } from "./StudentEngagementDialog";
import StudentCycleSummary from "@/components/coach/student-profile/StudentCycleSummary";
import { useStudentCycleSummary } from "@/hooks/useStudentCycleSummary";
import { waitingLabel } from "@/lib/coachPending";
import { ProtocolPayloadSchema, type ProtocolPayload } from "@/lib/protocolSchema";

const EvolutionComparisonLazy = lazyWithRetry(() => import("@/components/coach/EvolutionComparison"));
const AnamnesisViewerLazy = lazyWithRetry(() => import("@/components/anamnesis/AnamnesisViewer"));
const StudentWorkoutAnalyticsLazy = lazyWithRetry(() => import("@/components/coach/StudentWorkoutAnalytics"));
const PostureQuickTabLazy = lazyWithRetry(() => import("@/components/coach/posture/PostureQuickTab"));
const StudentProtocolPreviewLazy = lazyWithRetry(() => import("@/components/coach/StudentProtocolPreview"));

export type StudentProfileTab = "resumo" | "checkins" | "evolucao" | "postura" | "treinos" | "protocolo" | "anamnese";

const TABS: { value: StudentProfileTab; label: string }[] = [
  { value: "resumo", label: "Resumo" },
  { value: "checkins", label: "Check-ins" },
  { value: "evolucao", label: "Evolução" },
  { value: "postura", label: "Postura" },
  { value: "treinos", label: "Treinos" },
  { value: "protocolo", label: "Protocolo" },
  { value: "anamnese", label: "Anamnese" },
];

const Spinner = () => <SectionSkeleton />;

type PreviewSection = "workouts" | "diet" | "macros" | "guidelines" | "cycle";

function ProtocolTab({
  studentId, studentName, onEditProtocol,
}: { studentId: string; studentName: string; onEditProtocol: () => void }) {
  const { data, isLoading } = useStudentCycleSummary(studentId);
  const [preview, setPreview] = useState<PreviewSection | null>(null);
  if (isLoading) return <Spinner />;
  const raw = data?.protocol?.payload;
  const parsed = raw ? ProtocolPayloadSchema.safeParse(raw) : null;
  const payload: ProtocolPayload | null = parsed?.success ? parsed.data : null;
  const sections: { key: PreviewSection; label: string }[] = [
    { key: "workouts", label: "Treino" },
    { key: "diet", label: "Dieta" },
    { key: "macros", label: "Macros" },
    { key: "guidelines", label: "Diretrizes" },
    { key: "cycle", label: "Semana" },
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <p className="text-sm">
          {data?.protocol ? <>Protocolo atual: <strong>{data.protocol.name || "Sem nome"}</strong></> : "Nenhum protocolo publicado ainda."}
        </p>
        <Button onClick={onEditProtocol} className="gap-1.5">
          <Dumbbell className="w-4 h-4" /> {data?.protocol ? "Editar protocolo" : "Montar protocolo"}
        </Button>
      </div>
      {payload && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Ver como a aluna vê (versão publicada)
          </p>
          <div className="flex flex-wrap gap-2">
            {sections.map((s) => (
              <Button key={s.key} size="sm" variant="outline" onClick={() => setPreview(s.key)}>{s.label}</Button>
            ))}
          </div>
        </div>
      )}
      {payload && preview && (
        <Suspense fallback={null}>
          <StudentProtocolPreviewLazy
            open={!!preview}
            onClose={() => setPreview(null)}
            payload={payload}
            studentName={studentName}
            section={preview}
          />
        </Suspense>
      )}
    </div>
  );
}

export function StudentProfileSheet({
  student, open, onClose, coachId, initialTab = "resumo",
  onReply, onEditProtocol, onConfigure,
}: {
  student: StudentStatus | null;
  open: boolean;
  onClose: () => void;
  coachId: string | null;
  initialTab?: StudentProfileTab;
  /** Abre o painel de feedback (no check-in indicado ou no pendente mais antigo). */
  onReply: (s: StudentStatus, checkinId?: string) => void;
  onEditProtocol: (s: StudentStatus) => void;
  onConfigure: (s: StudentStatus) => void;
}) {
  const [tab, setTab] = useState<StudentProfileTab>(initialTab);
  useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab, student?.id]);

  if (!student) return null;
  const awaiting = student.awaitingReply;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="w-full max-w-none sm:max-w-5xl h-[100dvh] sm:h-[92vh] p-0 gap-0 flex flex-col overflow-hidden rounded-none sm:rounded-lg"
        data-testid="student-profile-sheet"
      >
        <DialogHeader className="px-4 sm:px-6 pt-4 pb-3 border-b border-border space-y-2 text-left">
          <DialogTitle className="pr-8 text-lg">
            <Private>{student.name || "Aluno"}</Private>
          </DialogTitle>
          <DialogDescription className="sr-only">Ficha do aluno com resumo, check-ins, evolução, postura, treinos, protocolo e anamnese.</DialogDescription>
          <div className="flex flex-wrap items-center gap-2">
            {student.goal && student.goal !== "—" && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-muted/40 border-border uppercase tracking-wider">
                {student.goal}
              </span>
            )}
            <AlertBadge
              level={student.alertLevel || "ok"}
              daysSinceLastFeedback={student.daysSinceLastFeedback}
              warningDays={student.warningDays}
              criticalDays={student.criticalDays}
              lastFeedback={student.lastFeedback}
              awaitingFirstProtocol={student.awaitingFirstProtocol}
            />
            <ClinicalSignalBadge signal={student.clinicalSignal} />
            <InsightBadge situacao={student.insightSituacao} />
            <WeightTrendBadge student={student} />
          </div>
          <div className="flex flex-wrap gap-2">
            {awaiting && (
              <Button size="sm" className="h-9 bg-amber-500 hover:bg-amber-600 text-white gap-1.5" onClick={() => onReply(student)}>
                <MessageSquareReply className="w-4 h-4" /> Responder check-in · {waitingLabel(awaiting.since)}
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => onEditProtocol(student)}>
              <Dumbbell className="w-4 h-4" /> Protocolo
            </Button>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as StudentProfileTab)} className="flex-1 min-h-0 flex flex-col">
          <div className="px-2 sm:px-6 pt-2 border-b border-border">
            <TabsList className="w-full justify-start overflow-x-auto overflow-y-hidden bg-transparent p-0 h-auto gap-1 [scrollbar-width:none]">
              {TABS.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="shrink-0 rounded-none border-b-2 border-transparent px-3 py-2 data-[state=active]:border-primary data-[state=active]:shadow-none"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
            <TabsContent value="resumo" className="mt-0 space-y-4">
              <StudentCycleSummary
                studentId={student.id}
                onReply={() => onReply(student)}
                onEditProtocol={() => onEditProtocol(student)}
                onPreviewProtocol={() => setTab("protocolo")}
              />
              <details className="rounded-xl border border-border bg-card p-3">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Uso do app e plano
                </summary>
                <div className="pt-3">
                  <StudentEngagementContent studentId={student.id} active={open && tab === "resumo"} />
                </div>
              </details>
            </TabsContent>

            <TabsContent value="checkins" className="mt-0">
              <div className="flex justify-end mb-2">
                <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs" onClick={() => onConfigure(student)}>
                  <Settings2 className="w-3.5 h-3.5" /> Prazo de check-in deste aluno
                </Button>
              </div>
              <CheckinHistoryList
                student={student}
                active={open && tab === "checkins"}
                onOpenCheckin={(id) => onReply(student, id)}
              />
            </TabsContent>

            <TabsContent value="evolucao" className="mt-0">
              {tab === "evolucao" && (
                <Suspense fallback={<Spinner />}>
                  <EvolutionComparisonLazy studentId={student.id} studentName={student.name} goal={student.goal} />
                </Suspense>
              )}
            </TabsContent>

            <TabsContent value="postura" className="mt-0">
              {tab === "postura" && (
                <Suspense fallback={<Spinner />}>
                  <PostureQuickTabLazy studentId={student.id} />
                </Suspense>
              )}
            </TabsContent>

            <TabsContent value="treinos" className="mt-0">
              {tab === "treinos" && coachId && (
                <Suspense fallback={<Spinner />}>
                  <StudentWorkoutAnalyticsLazy studentId={student.id} studentName={student.name} coachId={coachId} />
                </Suspense>
              )}
            </TabsContent>

            <TabsContent value="protocolo" className="mt-0">
              {tab === "protocolo" && (
                <ProtocolTab studentId={student.id} studentName={student.name} onEditProtocol={() => onEditProtocol(student)} />
              )}
            </TabsContent>

            <TabsContent value="anamnese" className="mt-0">
              {tab === "anamnese" && (
                <Suspense fallback={<Spinner />}>
                  <AnamnesisViewerLazy studentId={student.id} studentName={student.name} />
                </Suspense>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export default StudentProfileSheet;
