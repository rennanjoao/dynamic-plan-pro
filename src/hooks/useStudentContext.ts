// Dados da faixa do aluno no topo do protocolo: anamnese + último check-in.
// Só leitura; as mesmas tabelas que o construtor e o painel do coach já leem.
import { useQuery } from "@tanstack/react-query";
import { sb } from "@/integrations/supabase/untyped";
import { buildStudentContext, type StudentContext } from "@/lib/studentContext";

export function useStudentContext(studentId: string | null) {
  return useQuery<StudentContext>({
    queryKey: ["protocol-student-context", studentId],
    enabled: !!studentId,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: anamnesis }, { data: lastCheckin }] = await Promise.all([
        sb
          .from("anamnesis")
          .select("payload, baseline_metrics, submitted_at, updated_at")
          .eq("student_id", studentId)
          .maybeSingle(),
        sb
          .from("check_ins")
          .select("submitted_at, current_metrics")
          .eq("student_id", studentId)
          .order("submitted_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      return buildStudentContext({ anamnesis: anamnesis ?? null, lastCheckin: lastCheckin ?? null });
    },
  });
}
