import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { uploadToCloudinary, NEURO_SLIDERS } from "@/lib/anamnesisSchema";
import { notifyCoach } from "@/lib/notifyCoach";
import { consumeStoredReferral, peekStoredReferral } from "@/lib/referralCapture";
import { FotoSlot } from "@/components/shared/FotoSlot";
import { cn } from "@/lib/utils";
import { ShieldCheck, ArrowRight } from "lucide-react";

/* ── tipos ─────────────────────────────────────────────────── */
type ChoiceGroup = Record<string, string>;
interface CoachInfo { id: string; name: string; email: string | null; }

/* ── helpers de UI ─────────────────────────────────────────── */
function Choices({ options, group, state, setState, cols = 3 }: { options: { value: string; theme?: "green" | "amber" | "red" }[]; group: string; state: ChoiceGroup; setState: (s: ChoiceGroup) => void; cols?: number; }) {
  const THEME = { green: "border-green-500 bg-green-500/10 text-green-400", amber: "border-amber-400 bg-amber-400/10 text-amber-400", red: "border-red-500 bg-red-500/10 text-red-400" };
  return (
    <div className={cn("flex flex-wrap gap-2", cols === 2 && "grid grid-cols-2", cols === 3 && "grid grid-cols-3")}>
      {options.map(o => {
        const sel = state[group] === o.value;
        const t = o.theme ? THEME[o.theme] : "";
        return (
          <button key={o.value} type="button" onClick={() => setState({ ...state, [group]: sel ? "" : o.value })}
            className={cn("px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left", sel ? (t || "border-primary bg-primary/15 text-primary") : "border-border/50 bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground")}>{o.value}</button>
        );
      })}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="flex flex-col gap-1.5"><label className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</label>{children}</div>; }
function FiInput({ name, type = "text", placeholder, step, value, onChange }: { name: string; type?: string; placeholder?: string; step?: string; value: string; onChange: (v: string) => void; }) { return <input name={name} type={type} step={step} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-card border border-border/60 text-foreground text-sm outline-none focus:border-primary/50 transition-colors" />; }
function FiTextarea({ name, placeholder, value, onChange, rows = 3 }: { name: string; placeholder?: string; value: string; onChange: (v: string) => void; rows?: number; }) { return <textarea name={name} placeholder={placeholder} value={value} rows={rows} onChange={e => onChange(e.target.value)} className="w-full px-4 py-3 rounded-lg bg-card border border-border/60 text-foreground text-sm outline-none focus:border-primary/50 transition-colors resize-none" />; }
function SecHead({ num, title }: { num: string; title: string }) { return <div className="flex items-center gap-3 mb-4"><span className="text-xs font-bold text-primary border border-primary/30 rounded-md px-2 py-0.5">{num}</span><span className="font-bold text-lg text-foreground">{title}</span></div>; }
function Card({ children, label }: { children: React.ReactNode; label?: string }) { return <div className="bg-card border border-border/40 rounded-xl p-4 mb-3 space-y-4">{label && <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border/30 pb-2">{label}</p>}{children}</div>; }

/* ── componente principal ───────────────────────────────────── */
const ANAMNESIS_DRAFT_KEY = (uid: string) => `anamnesis_draft_${uid}`;
// Rascunho sem usuário logado ainda (fluxo de cadastro): o studentId só existe
// depois do supabase.auth.signUp bem-sucedido, então usamos uma chave fixa
// para não perder o que o aluno já preencheu antes de enviar.
const ANAMNESIS_ANON_DRAFT_KEY = "anamnesis_draft_anon";

const Anamnesis = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEditMode = searchParams.get("mode") === "edit";
  const [step, setStep] = useState<"code" | "form" | "done">("code");
  const [inviteCode, setInviteCode] = useState("");
  const [coach, setCoach] = useState<CoachInfo | null>(null);
  const [loggedUserId, setLoggedUserId] = useState<string | null>(null);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [editingAnamnesisId, setEditingAnamnesisId] = useState<string | null>(null);
  const [studentEditCount, setStudentEditCount] = useState(0);

  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  const [gender, setGender] = useState<"F" | "M" | "">("");
  const [tpm, setTpm] = useState<string[]>([]);
  const [quedaF, setQuedaF] = useState<string[]>([]);
  const [groups, setGroups] = useState<ChoiceGroup>({});
  const [fotoFiles, setFotoFiles] = useState<Record<string, File | null>>({ frente: null, lateral_dir: null, lateral_esq: null, costas: null });
  const [fotoPreviews, setFotoPreviews] = useState<Record<string, string | null>>({ frente: null, lateral_dir: null, lateral_esq: null, costas: null });

  const [d, setD] = useState<Record<string, string>>({});
  const set = (k: string) => (v: string) => setD(p => ({ ...p, [k]: v }));
  const g = (k: string) => d[k] ?? "";

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  // ─── Autosave de rascunho (localStorage) ──────────────────────
  // Salva o progresso a cada mudança (debounced) para evitar perda de dados
  // se o aluno fechar a aba antes de submeter. Limpo no submit com sucesso.
  const draftSaveFailedRef = useRef(false);
  useEffect(() => {
    if (bootstrapping || step !== "form" || isEditMode) return;
    // Sem conta ainda (novo cadastro) → grava sob a chave anônima, já que
    // studentId só existe após o signUp no submit final.
    const draftKey = loggedUserId ? ANAMNESIS_DRAFT_KEY(loggedUserId) : ANAMNESIS_ANON_DRAFT_KEY;
    const handle = setTimeout(() => {
      try {
        const draft = { d, gender, tpm, quedaF, groups, savedAt: Date.now() };
        localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        // Quota estourada ou localStorage bloqueado — sem isso o aluno não
        // tinha como saber que o preenchimento não estava mais protegido
        // contra fechar a aba. Avisa uma única vez para não repetir a cada
        // tecla digitada.
        if (!draftSaveFailedRef.current) {
          draftSaveFailedRef.current = true;
          showToast("Não foi possível salvar seu progresso automaticamente neste dispositivo. Evite fechar a página antes de enviar.");
        }
      }
    }, 600);
    return () => clearTimeout(handle);
  }, [d, gender, tpm, quedaF, groups, bootstrapping, step, loggedUserId, isEditMode]);

  // Restaura rascunho ao entrar na etapa do formulário (modo de cadastro, não
  // em edição) — cobre tanto quem já está logado quanto quem ainda não criou
  // conta (usa a chave anônima até o studentId existir).
  useEffect(() => {
    if (isEditMode || step !== "form") return;
    const draftKey = loggedUserId ? ANAMNESIS_DRAFT_KEY(loggedUserId) : ANAMNESIS_ANON_DRAFT_KEY;
    try {
      // Se a conta acabou de existir (loggedUserId), o rascunho pode ainda
      // estar salvo sob a chave anônima — foi escrito antes do signUp
      // acontecer. Sem este fallback, um reload nesse meio-tempo (ex.: conta
      // criada mas o restante do envio não terminou) "zera" o formulário na
      // tela mesmo com os dados intactos no localStorage.
      let raw = localStorage.getItem(draftKey);
      let usedAnonFallback = false;
      if (!raw && loggedUserId) {
        raw = localStorage.getItem(ANAMNESIS_ANON_DRAFT_KEY);
        usedAnonFallback = !!raw;
      }
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft?.d && typeof draft.d === "object") {
        setD(prev => ({ ...draft.d, ...prev, nome: prev.nome || draft.d.nome || "", email: prev.email || draft.d.email || "" }));
      }
      if (draft?.gender === "F" || draft?.gender === "M") setGender(draft.gender);
      if (Array.isArray(draft?.tpm)) setTpm(draft.tpm);
      if (Array.isArray(draft?.quedaF)) setQuedaF(draft.quedaF);
      if (draft?.groups && typeof draft.groups === "object") setGroups(draft.groups);
      // Migra o rascunho para a chave definitiva do usuário e limpa a
      // anônima, para as próximas gravações (e uma eventual recuperação
      // futura) já usarem a chave certa.
      if (usedAnonFallback && loggedUserId) {
        try {
          localStorage.setItem(ANAMNESIS_DRAFT_KEY(loggedUserId), raw);
          localStorage.removeItem(ANAMNESIS_ANON_DRAFT_KEY);
        } catch { /* noop */ }
      }
    } catch { /* draft corrompido — ignora */ }
  }, [loggedUserId, isEditMode, step]);

  // Detecta aluno já logado e pula código + signup
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setBootstrapping(false); return; }

        // Já tem anamnese? então não precisa preencher de novo
        const { data: existing } = await supabase
          .from("anamnesis")
          .select("id, submitted_at, payload, student_edit_count")
          .eq("student_id", user.id)
          .maybeSingle();
        if (existing?.submitted_at && !isEditMode) {
          navigate("/student-area");
          return;
        }

        setLoggedUserId(user.id);
        const meta = (user.user_metadata || {}) as Record<string, string>;

        // Em modo edição: pré-carrega payload existente
        if (isEditMode && existing?.submitted_at) {
          const count = Number((existing as any).student_edit_count ?? 0);
          if (count >= 2) {
            showToast("Limite de 2 edições da anamnese atingido. Fale com seu treinador.");
            navigate("/student-area");
            return;
          }
          setEditingAnamnesisId(existing.id as string);
          setStudentEditCount(count);
          const p = (existing.payload || {}) as Record<string, any>;
          // Hidrata estados específicos
          if (p.gender === "F" || p.gender === "M") setGender(p.gender);
          if (typeof p.tpm === "string" && p.tpm) setTpm(p.tpm.split(",").map((s: string) => s.trim()).filter(Boolean));
          if (typeof p.queda_capilar_f === "string" && p.queda_capilar_f) setQuedaF(p.queda_capilar_f.split(",").map((s: string) => s.trim()).filter(Boolean));
          const grp: ChoiceGroup = {};
          for (const key of ["meta_prioridade","nivel_treino","tem_academia","pump","hidratacao","compulsao_estado","fezes","acorda_descansado","ciclo_regular","erecao_matinal","queda_masc","hist_pai","hist_avo_mat"]) {
            if (typeof p[key] === "string") grp[key] = p[key];
          }
          setGroups(grp);
          const previews: Record<string, string | null> = { frente: null, lateral_dir: null, lateral_esq: null, costas: null };
          const fotos = (p.fotos as Record<string, string>) || {};
          for (const k of ["frente","lateral_dir","lateral_esq","costas"]) {
            if (fotos[k]) previews[k] = fotos[k];
          }
          setFotoPreviews(previews);
          // Strings de input (campos planos)
          const d0: Record<string, string> = {};
          for (const [k, v] of Object.entries(p)) {
            if (v == null) continue;
            if (typeof v === "string" || typeof v === "number") d0[k] = String(v);
          }
          d0.nome = d0.nome || meta.full_name || "";
          d0.email = d0.email || user.email || "";
          setD(d0);
        } else {
          setD(prev => ({
            ...prev,
            nome: prev.nome || meta.full_name || "",
            email: prev.email || user.email || "",
          }));
        }

        // Carrega vínculo de coach, se houver
        const { data: link } = await supabase
          .from("coach_students")
          .select("coach_id")
          .eq("student_id", user.id)
          .eq("status", "active")
          .maybeSingle();

        if (link?.coach_id) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name, notification_email")
            .eq("user_id", link.coach_id)
            .maybeSingle();
          setCoach({
            id: link.coach_id,
            name: prof?.full_name || "Seu Treinador",
            email: prof?.notification_email || null,
          });
        } else {
          setCoach({ id: "", name: "Sem treinador vinculado", email: null });
        }

        setStep("form");
      } finally {
        setBootstrapping(false);
      }
    })();
  }, [navigate, isEditMode]);

  // ── Auto-resolve do coach via indicação (?ref= do QR do WorkoutShareCard) ──
  // Se o visitante chegou com um código de indicação válido, descobrimos
  // sozinhos o coach do aluno que indicou e pulamos a tela de "digite o
  // código do treinador" — sem isso, o link de indicação levava a pessoa até
  // a porta do site mas ela ainda precisaria de um segundo código pra entrar.
  useEffect(() => {
    if (bootstrapping || step !== "code" || loggedUserId) return;
    const stored = peekStoredReferral();
    if (!stored?.code) return;

    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("resolve-referral-coach", {
          body: { refCode: stored.code },
        });
        if (!error && data?.coach_id) {
          setCoach({ id: data.coach_id, name: data.coach_name, email: data.notification_email });
          setStep("form");
        }
        // Falhou (código expirado, indicador sem coach ativo etc.) → fica na
        // tela de código manual normalmente, sem mostrar erro nenhum ao visitante.
      } catch { /* fallback silencioso */ }
    })();
  }, [bootstrapping, step, loggedUserId]);

  // ETAPA 1: VALIDAR CÓDIGO DO COACH
  const handleValidateCode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const code = inviteCode.trim().toUpperCase();
    if (!code) { showToast("Insira o código fornecido pelo treinador."); return; }
    
    setValidating(true);
    try {
      const { data, error } = await supabase.functions.invoke('validate-invite-code', { body: { code } });
      if (error || !data?.coach_id) throw new Error(data?.error || "Código inválido ou inexistente.");
      
      setCoach({ id: data.coach_id, name: data.coach_name, email: data.notification_email });
      setStep("form"); // Avança para a Anamnese
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Erro ao validar código.");
    } finally {
      setValidating(false);
    }
  };

  function toggleMulti(arr: string[], setArr: (a: string[]) => void, val: string, solo?: boolean) {
    if (solo) { setArr(arr.includes(val) ? [] : [val]); return; }
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr.filter(x => x !== "Sem sintomas" && x !== "Nenhuma"), val]);
  }
  function setFoto(key: string, file: File) {
    setFotoFiles(p => ({ ...p, [key]: file }));
    const r = new FileReader();
    r.onload = e => setFotoPreviews(p => ({ ...p, [key]: e.target?.result as string }));
    r.readAsDataURL(file);
  }

  // ETAPA 2: SUBMETER ANAMNESE E CRIAR CONTA
  const handleSubmit = useCallback(async () => {
    if (!coach) return;
    if (!g("nome")) { showToast("Preencha seu nome."); return; }
    if (!loggedUserId) {
      if (!g("email") || !g("senha")) { showToast("Preencha Nome, E-mail e crie sua Senha."); return; }
      if (g("senha").length < 6) { showToast("A senha deve ter no mínimo 6 caracteres."); return; }
    }
    if (!gender) { showToast("Selecione seu gênero."); return; }

    setSaving(true);
    try {
      let studentId = loggedUserId;
      if (!studentId) {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: g("email"),
          password: g("senha"),
          options: { data: { full_name: g("nome") } }
        });
        if (authError || !authData.user) throw new Error(authError?.message === "User already registered" ? "Este e-mail já está cadastrado." : "Erro ao criar conta.");
        studentId = authData.user.id;
      }

      // Garante que o email do usuário esteja salvo no perfil (para envio de e-mails do coach)
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser?.email) {
          await (supabase.from("profiles") as any).upsert(
            { user_id: studentId!, email: currentUser.email },
            { onConflict: "user_id" }
          );
        }
      } catch { /* não bloqueia o submit da anamnese */ }

      const fotos: Record<string, string> = {};
      // Preserva fotos já enviadas em modo edição quando o aluno não carrega arquivo novo
      if (isEditMode) {
        for (const k of ["frente","lateral_dir","lateral_esq","costas"]) {
          const url = fotoPreviews[k];
          if (url && url.startsWith("http")) fotos[k] = url;
        }
      }
      for (const [key, file] of Object.entries(fotoFiles)) {
        if (file) { try { fotos[key] = await uploadToCloudinary(file); } catch { fotos[key] = ""; } }
      }

      const coachIdOrNull = coach.id || null;
      const payload: Record<string, unknown> = {
        ...d, gender, tpm: tpm.join(", "), queda_capilar_f: quedaF.join(", "), ...groups, fotos, coach_id: coachIdOrNull,
      };

      const baseline: Record<string, number> = {};
      ["altura", "peso", "pescoco", "cintura", "quadril", "braco_d_relaxado", "braco_e_relaxado", "braco_d_contraido", "braco_e_contraido", "coxa_d", "coxa_e", "pant_d", "pant_e"].forEach(k => {
        const n = parseFloat(String(payload[k] ?? "").replace(",", "."));
        if (!isNaN(n)) baseline[k] = n;
      });

      const anamnesisRow: Record<string, unknown> = {
        student_id: studentId,
        coach_id: coachIdOrNull,
        payload,
        baseline_metrics: baseline,
        submitted_at: new Date().toISOString(),
      };
      let finalAnamnesisId: string | null = null;
      if (isEditMode && editingAnamnesisId) {
        anamnesisRow.student_edit_count = studentEditCount + 1;
        anamnesisRow.updated_at = new Date().toISOString();
        await (supabase.from("anamnesis") as any).update(anamnesisRow).eq("id", editingAnamnesisId);
        finalAnamnesisId = editingAnamnesisId;
      } else {
        const { data: prior } = await supabase
          .from("anamnesis")
          .select("id")
          .eq("student_id", studentId!)
          .maybeSingle();
        if (prior?.id) {
          await (supabase.from("anamnesis") as any).update(anamnesisRow).eq("id", prior.id);
          finalAnamnesisId = prior.id;
        } else {
          const { data: inserted } = await (supabase.from("anamnesis") as any)
            .insert(anamnesisRow)
            .select("id")
            .single();
          finalAnamnesisId = inserted?.id ?? null;
        }
      }

      if (finalAnamnesisId) {
        try {
          await supabase.functions.invoke("anamnesis-summary", {
            body: { anamnesisId: finalAnamnesisId },
          });
        } catch (summaryErr) {
          console.warn("anamnesis-summary falhou ao disparar (não bloqueia o cadastro)", summaryErr);
        }
      }

      // Vincula aluno→coach
      if (coachIdOrNull && !isEditMode) {
        const { error: linkErr } = await supabase.functions.invoke("link-coach-student", {
          body: { coachId: coachIdOrNull },
        });
        if (linkErr) console.warn("link-coach-student falhou", linkErr);

        // ── Atribuição de indicação aluno→aluno (efeito rede do WorkoutShareCard) ──
        // Só roda no primeiro cadastro (nunca em edição) e só se havia um código
        // de referral capturado anteriormente (QR escaneado na landing page).
        // Resolução do código e gravação acontecem 100% no backend (service role)
        // — o client nunca decide quem é o indicador.
        const storedRef = consumeStoredReferral();
        if (storedRef?.code) {
          const { error: refErr } = await supabase.functions.invoke("register-referral", {
            body: {
              refCode: storedRef.code,
              coachId: coachIdOrNull,
              utmSource: storedRef.utmSource,
              utmMedium: storedRef.utmMedium,
              utmCampaign: storedRef.utmCampaign,
            },
          });
          if (refErr) console.warn("register-referral falhou", refErr);
        }
      }

      if (coach.email) {
        await notifyCoach({
          coachEmail: coach.email,
          studentName: String(payload.nome ?? ""),
          studentEmail: String(payload.email ?? ""),
          kind: "anamnesis",
          summary: isEditMode
            ? `Aluno atualizou a própria anamnese (edição ${studentEditCount + 1}/2).`
            : `Aluno enviou anamnese completa (${Object.keys(payload).length} campos).`,
          data: { ...payload, genero: gender, tpm: tpm.join(", "), queda_capilar: quedaF.join(", ") },
          photos: fotos,
        });
      }

      if (isEditMode) {
        showToast("Anamnese atualizada com sucesso.");
        setTimeout(() => navigate("/student-area"), 800);
      } else {
        setStep("done");
      }
      // limpa rascunho local após submit bem-sucedido (chave definitiva e a anônima,
      // já que o preenchimento pode ter começado antes da conta existir)
      try {
        if (studentId) localStorage.removeItem(ANAMNESIS_DRAFT_KEY(studentId));
        localStorage.removeItem(ANAMNESIS_ANON_DRAFT_KEY);
      } catch { /* noop */ }
    } catch (e: unknown) {
      console.error(e);
      showToast(e instanceof Error ? e.message : "Erro ao processar cadastro.");
    } finally {
      setSaving(false);
    }
  // [FIX MÉDIO] 'g' adicionado às dependências — é uma função que lê 'd',
  // mas como está definida fora do useCallback, o linter a exige aqui.
  }, [d, g, gender, tpm, quedaF, groups, fotoFiles, fotoPreviews, coach, loggedUserId, isEditMode, editingAnamnesisId, studentEditCount, navigate]);

  const chBtn = (id: string) => cn("px-5 py-2.5 rounded-xl text-sm font-bold border-2 transition-all", gender === id ? "border-primary bg-primary/15 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/40");

  /* --- RENDERIZAÇÃO CONDICIONAL DAS ETAPAS --- */

  if (bootstrapping) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-7 h-7 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (step === "code") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 gradient-hero" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,hsl(350_89%_50%/0.08),transparent_60%)]" />
        
        <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="absolute left-6 top-6 z-20 gap-2 text-muted-foreground hover:text-foreground">
          Voltar
        </Button>

        <div className="max-w-md w-full glass-strong rounded-3xl p-8 space-y-8 relative z-10">
          <div className="text-center space-y-3">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-primary glow-primary">
              <ShieldCheck size={32} />
            </div>
            <h1 className="text-3xl font-black text-foreground">Código de Acesso</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Insira o código fornecido pelo seu treinador para vincular sua conta e iniciar a avaliação.
            </p>
          </div>
          
          <form onSubmit={handleValidateCode} className="space-y-4">
            <input type="text" placeholder="EX: ELITE2026" value={inviteCode} onChange={e => setInviteCode(e.target.value.toUpperCase())}
              className="w-full text-center text-2xl tracking-[0.3em] font-black px-4 py-5 rounded-xl bg-background/50 border-2 border-border/60 outline-none focus:border-primary/80 uppercase transition-all placeholder:tracking-normal placeholder:font-normal" />
            
            <Button type="submit" size="lg" className="w-full h-14 text-base font-bold glow-primary mt-2" disabled={validating}>
              {validating ? "Validando..." : "Validar Código"}
              {!validating && <ArrowRight className="w-5 h-5 ml-2" />}
            </Button>
          </form>
        </div>
        {toast && <div className="fixed bottom-6 bg-card border border-border px-5 py-3 rounded-xl text-sm shadow-lg z-50">{toast}</div>}
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 text-center gap-5 relative z-10">
        <div className="w-20 h-20 rounded-full border-4 border-primary bg-primary/10 flex items-center justify-center text-4xl text-primary glow-primary">✓</div>
        <h2 className="text-3xl font-black text-foreground mt-4">Conta e Ficha Criadas!</h2>
        <p className="text-muted-foreground text-base max-w-sm leading-relaxed">
          Obrigado(a), <span className="text-primary font-bold">{g("nome").split(" ")[0]}</span>. Seu vínculo com <span className="text-foreground font-bold">{coach?.name}</span> foi estabelecido.
        </p>
        <Button size="lg" className="mt-4 px-8 h-14 rounded-xl text-base font-bold" onClick={() => navigate("/student-area")}>Acessar Área do Aluno</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-20 relative">
      <div className="sticky top-0 z-50 flex items-center justify-between px-5 py-4 bg-background/90 backdrop-blur border-b border-border/40 shadow-sm">
        <span className="font-bold text-sm text-primary tracking-widest uppercase">
          {isEditMode ? `Editar Anamnese · ${studentEditCount + 1}/2` : "Ficha de Anamnese"}
        </span>
        {!isEditMode && (
          <Button variant="outline" size="sm" onClick={() => { setD({}); setGender(""); setGroups({}); showToast("Limpo."); }}>Limpar</Button>
        )}
        {isEditMode && (
          <Button variant="ghost" size="sm" onClick={() => navigate("/student-area")}>Voltar</Button>
        )}
      </div>

      <div className="max-w-xl mx-auto px-4 py-8 space-y-8 relative z-10">
        {/* Treinador Travado (Read-Only) */}
        <Card label="Seu Treinador">
          <div className="flex items-center gap-4 px-5 py-4 rounded-xl border-2 border-primary/30 bg-primary/5">
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xl shrink-0 glow-primary">
              {coach?.name[0].toUpperCase()}
            </div>
            <div>
              <p className="text-base font-bold text-foreground">{coach?.name}</p>
              <p className="text-xs font-medium text-primary uppercase tracking-wider mt-0.5 flex items-center gap-1">
                <ShieldCheck size={12} /> Vínculo Autenticado
              </p>
            </div>
          </div>
        </Card>

        {/* 01 — Quem é você */}
        <section>
          <SecHead num="01" title="Sua Conta & Identificação" />
          <Card label="Dados Pessoais e Acesso">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Field label="Nome completo"><FiInput name="nome" placeholder="Seu nome completo" value={g("nome")} onChange={set("nome")} /></Field></div>
              {!loggedUserId && <div className="col-span-2"><Field label="E-mail (Para Login)"><FiInput name="email" type="email" placeholder="voce@email.com" value={g("email")} onChange={set("email")} /></Field></div>}
              {!loggedUserId && <div className="col-span-2"><Field label="Crie uma Senha"><FiInput name="senha" type="password" placeholder="Mínimo 6 caracteres" value={g("senha")} onChange={set("senha")} /></Field></div>}
              <Field label="Data de nascimento"><FiInput name="data_nasc" type="date" value={g("data_nasc")} onChange={set("data_nasc")} /></Field>
              <Field label="WhatsApp"><FiInput name="whatsapp" type="tel" placeholder="(11) 99999-9999" value={g("whatsapp")} onChange={set("whatsapp")} /></Field>
              <div className="col-span-2"><Field label="Cidade / Estado"><FiInput name="cidade" placeholder="Ex: São Paulo / SP" value={g("cidade")} onChange={set("cidade")} /></Field></div>
            </div>
          </Card>
          <Card label="Gênero">
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setGender("F")} className={chBtn("F")}>♀ Feminino</button>
              <button type="button" onClick={() => setGender("M")} className={chBtn("M")}>♂ Masculino</button>
            </div>
          </Card>
        </section>

        {/* 02 — Ponto de partida */}
        <section>
          <SecHead num="02" title="Seu ponto de partida" />
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 mb-3 space-y-1.5 text-xs text-muted-foreground">
            <p className="text-[11px] font-bold uppercase tracking-widest text-primary mb-2">📏 Como medir corretamente</p>
            <p>• <span className="text-foreground font-medium">Pescoço:</span> logo abaixo do "gogó" (laringe).</p>
            <p>• <span className="text-foreground font-medium">Cintura:</span> na altura do umbigo (M) ou na parte mais fina (F).</p>
            <p>• <span className="text-foreground font-medium">Quadril:</span> na maior protuberância dos glúteos.</p>
            <p>• A fita deve estar firme, <span className="text-foreground font-medium">sem afundar na pele</span>.</p>
          </div>
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Altura (cm)"><FiInput name="altura" type="number" placeholder="170" value={g("altura")} onChange={set("altura")} /></Field>
              <Field label="Peso (kg)"><FiInput name="peso" type="number" step="0.1" placeholder="70.0" value={g("peso")} onChange={set("peso")} /></Field>
              <Field label="Pescoço (cm)"><FiInput name="pescoco" type="number" step="0.1" placeholder="38" value={g("pescoco")} onChange={set("pescoco")} /></Field>
              <Field label="Cintura no umbigo (cm)"><FiInput name="cintura" type="number" step="0.1" placeholder="80" value={g("cintura")} onChange={set("cintura")} /></Field>
              <Field label="Quadril (cm)"><FiInput name="quadril" type="number" step="0.1" placeholder="98" value={g("quadril")} onChange={set("quadril")} /></Field>
              <Field label="Braço D Relaxado (cm)"><FiInput name="braco_d_relaxado" type="number" step="0.1" placeholder="Dir." value={g("braco_d_relaxado")} onChange={set("braco_d_relaxado")} /></Field>
              <Field label="Braço E Relaxado (cm)"><FiInput name="braco_e_relaxado" type="number" step="0.1" placeholder="Esq." value={g("braco_e_relaxado")} onChange={set("braco_e_relaxado")} /></Field>
              <Field label="Braço D Contraído (cm)"><FiInput name="braco_d_contraido" type="number" step="0.1" placeholder="Dir." value={g("braco_d_contraido")} onChange={set("braco_d_contraido")} /></Field>
              <Field label="Braço E Contraído (cm)"><FiInput name="braco_e_contraido" type="number" step="0.1" placeholder="Esq." value={g("braco_e_contraido")} onChange={set("braco_e_contraido")} /></Field>
              <Field label="Coxa D (cm)"><FiInput name="coxa_d" type="number" step="0.1" placeholder="Dir." value={g("coxa_d")} onChange={set("coxa_d")} /></Field>
              <Field label="Coxa E (cm)"><FiInput name="coxa_e" type="number" step="0.1" placeholder="Esq." value={g("coxa_e")} onChange={set("coxa_e")} /></Field>
              <Field label="Pant. D (cm)"><FiInput name="pant_d" type="number" step="0.1" placeholder="Dir." value={g("pant_d")} onChange={set("pant_d")} /></Field>
              <Field label="Pant. E (cm)"><FiInput name="pant_e" type="number" step="0.1" placeholder="Esq." value={g("pant_e")} onChange={set("pant_e")} /></Field>
              <div className="col-span-2"><Field label="Histórico de peso (máx/mín)"><FiInput name="hist_peso" placeholder="Ex: máx 90kg, mín 62kg" value={g("hist_peso")} onChange={set("hist_peso")} /></Field></div>
            </div>
          </Card>
        </section>

        {/* 03 — Para onde quer chegar */}
        <section>
          <SecHead num="03" title="Para onde você quer chegar" />
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Peso alvo (kg)"><FiInput name="meta_peso" type="number" step="0.1" placeholder="65" value={g("meta_peso")} onChange={set("meta_peso")} /></Field>
              <Field label="Prazo (meses)"><FiInput name="meta_prazo" type="number" placeholder="6" value={g("meta_prazo")} onChange={set("meta_prazo")} /></Field>
            </div>
            <Field label="Prioridade">
              <Choices cols={3} group="meta_prioridade" state={groups} setState={setGroups} options={["Hipertrofia","Perda de gordura","Recomposição","Performance","Saúde"].map(v => ({ value: v }))} />
            </Field>
            <Field label="Objetivos detalhados"><FiTextarea name="objetivos" placeholder="Descreva seus objetivos..." value={g("objetivos")} onChange={set("objetivos")} /></Field>
          </Card>
        </section>

        {/* 04 — Rotina */}
        <section>
          <SecHead num="04" title="Sua rotina real" />
          <Card>
            <Field label="Profissão e horário"><FiTextarea name="profissao" placeholder="Ex: Analista, 8h–18h, home office" value={g("profissao")} onChange={set("profissao")} /></Field>
            <Field label="Estudos"><FiInput name="estudos" placeholder="Ex: Faculdade 19h–22h ou Não estudo" value={g("estudos")} onChange={set("estudos")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dorme às"><FiInput name="horario_dormir" placeholder="Ex: 23h" value={g("horario_dormir")} onChange={set("horario_dormir")} /></Field>
              <Field label="Acorda às"><FiInput name="horario_acordar" placeholder="Ex: 6h30" value={g("horario_acordar")} onChange={set("horario_acordar")} /></Field>
            </div>
          </Card>
        </section>

        {/* 05 — Treino */}
        <section>
          <SecHead num="05" title="Histórico de treino" />
          <Card label="Experiência">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Anos treinando"><FiInput name="anos_treino" type="number" placeholder="Ex: 3" value={g("anos_treino")} onChange={set("anos_treino")} /></Field>
              <Field label="Nível">
                <Choices cols={3} group="nivel_treino" state={groups} setState={setGroups} options={["Iniciante","Intermediário","Avançado"].map(v => ({ value: v }))} />
              </Field>
            </div>
            <Field label="Atividades atuais"><FiTextarea name="atividades" placeholder="Ex: Musculação 4x/semana" value={g("atividades")} onChange={set("atividades")} /></Field>
          </Card>
          
          <Card label="Disponibilidade">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Dias livres/semana"><FiInput name="dias_treino" type="number" placeholder="Ex: 4" value={g("dias_treino")} onChange={set("dias_treino")} /></Field>
              <Field label="Duração máx. disponível"><FiInput name="duracao_sessao" placeholder="Ex: 60 min" value={g("duracao_sessao")} onChange={set("duracao_sessao")} /></Field>
              <div className="col-span-2">
                <Field label="Horário que vai treinar"><FiInput name="horarios_treino" placeholder="Ex: Manhãs (07h) ou Noites (19h)" value={g("horarios_treino")} onChange={set("horarios_treino")} /></Field>
              </div>
              <div className="col-span-2">
                <Field label="Aeróbico em horário separado?"><FiInput name="aerobico_separado" placeholder="Ex: 30 min de manhã sem prejudicar o sono (Ou não tenho)" value={g("aerobico_separado")} onChange={set("aerobico_separado")} /></Field>
              </div>
            </div>
            <Field label="Academia?">
              <Choices cols={3} group="tem_academia" state={groups} setState={setGroups} options={[{ value: "Sim", theme: "green" }, { value: "Home gym" }, { value: "Não" }]} />
            </Field>
            <Field label="Equipamentos (se home gym)"><FiInput name="equipamentos" placeholder="Ex: Barras, halteres" value={g("equipamentos")} onChange={set("equipamentos")} /></Field>
          </Card>

          <Card label="Diagnóstico">
            <Field label="Sem descanso há quanto tempo?"><FiInput name="descanso_treino" placeholder="Ex: 8 meses" value={g("descanso_treino")} onChange={set("descanso_treino")} /></Field>
            <Field label="Pump no treino">
              <Choices cols={2} group="pump" state={groups} setState={setGroups} options={[{ value: "Inexistente", theme: "red" }, { value: "Fraco", theme: "amber" }, { value: "Bom", theme: "green" }, { value: "Ótimo", theme: "green" }]} />
            </Field>
            <Field label="Lesões / histórico ortopédico"><FiTextarea name="lesoes" placeholder="Ex: Lesão no ombro. Ou Nenhuma." value={g("lesoes")} onChange={set("lesoes")} /></Field>
          </Card>
        </section>

        {/* 06 — Substâncias */}
        <section>
          <SecHead num="06" title="Histórico de Substâncias" />
          <Card>
            <Field label="Remédios prescritos"><FiTextarea name="remedios" placeholder="Nenhum." value={g("remedios")} onChange={set("remedios")} /></Field>
            <Field label="Drogas lícitas / ilícitas"><FiTextarea name="drogas" placeholder="Ex: Álcool social" value={g("drogas")} onChange={set("drogas")} /></Field>
            <Field label="Hormônios / anabolizantes / anticoncepcionais"><FiTextarea name="hormonios" placeholder="Nenhum." value={g("hormonios")} onChange={set("hormonios")} /></Field>
            <Field label="Estimulantes (café, pré-treino)"><FiTextarea name="estimulantes" placeholder="Ex: 2 cafés/dia" value={g("estimulantes")} onChange={set("estimulantes")} /></Field>
            <Field label="Suplementação completa atual"><FiTextarea name="suplementacao" placeholder="Ex: Creatina 5g, Whey 30g..." value={g("suplementacao")} onChange={set("suplementacao")} /></Field>
          </Card>
        </section>

        {/* 07 — Alimentação */}
        <section>
          <SecHead num="07" title="Alimentação & digestão" />
          <Card>
            <Field label="Água/dia">
              <Choices cols={3} group="hidratacao" state={groups} setState={setGroups} options={[{ value: "≤1L", theme: "red" }, { value: "2L", theme: "amber" }, { value: "3L" }, { value: "4L", theme: "green" }, { value: "5L+", theme: "green" }]} />
            </Field>
            <Field label="Recordatório alimentar — dia típico completo"><FiTextarea name="recordatorio" rows={5} placeholder={"07h — 2 ovos, café\n12h — 150g arroz, 150g frango, salada\n16h — 1 banana, whey\n19h — Omelete, legumes"} value={g("recordatorio")} onChange={set("recordatorio")} /></Field>
            <Field label="Disponibilidade alimentar no dia"><FiTextarea name="disponibilidade_alim" placeholder="Ex: Levo marmita, geladeira no trabalho" value={g("disponibilidade_alim")} onChange={set("disponibilidade_alim")} /></Field>
            <Field label="Alergias / Intolerâncias"><FiTextarea name="alergias" placeholder="Ex: Intolerante a lactose" value={g("alergias")} onChange={set("alergias")} /></Field>
            <Field label="Relação com comida / Histórico de dietas"><FiTextarea name="rel_comida" placeholder="Já fez dieta restritiva? Como é sua relação com comida hoje?" value={g("rel_comida")} onChange={set("rel_comida")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Compulsão alimentar?">
                <Choices cols={3} group="compulsao_estado" state={groups} setState={setGroups} options={[{ value: "Não", theme: "green" }, { value: "Leve", theme: "amber" }, { value: "Forte", theme: "red" }]} />
              </Field>
              <Field label="Horário / gatilho"><FiInput name="compulsao_horario" placeholder="Ex: À noite..." value={g("compulsao_horario")} onChange={set("compulsao_horario")} /></Field>
            </div>
          </Card>
          <Card label="Saúde Intestinal">
            <Field label="Consistência das fezes">
              <Choices cols={2} group="fezes" state={groups} setState={setGroups} options={[{ value: "Preso", theme: "red" }, { value: "Irregular", theme: "amber" }, { value: "Normal", theme: "green" }, { value: "Solto" }]} />
            </Field>
            <Field label="Refluxo, gastrite, azia, gases"><FiTextarea name="gastrico" placeholder="Nenhum." value={g("gastrico")} onChange={set("gastrico")} /></Field>
            <Field label="Obs. intestino"><FiInput name="obs_fezes" placeholder="Ex: Gases com leguminosas" value={g("obs_fezes")} onChange={set("obs_fezes")} /></Field>
          </Card>
        </section>

        {/* 08 — Sono */}
        <section>
          <SecHead num="08" title="Descanso & recuperação" />
          <Card>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tempo para dormir"><FiInput name="tempo_sono" placeholder="Ex: ~20 min" value={g("tempo_sono")} onChange={set("tempo_sono")} /></Field>
              <Field label="Pico de cansaço"><FiInput name="pico_cansaco" placeholder="Ex: ~15h" value={g("pico_cansaco")} onChange={set("pico_cansaco")} /></Field>
            </div>
            <Field label="Acorda descansado?">
              <Choices cols={3} group="acorda_descansado" state={groups} setState={setGroups} options={[{ value: "Sim", theme: "green" }, { value: "Às vezes" }, { value: "Não", theme: "red" }]} />
            </Field>
            <Field label="Acorda à noite?"><FiInput name="acorda_noite" placeholder="Não." value={g("acorda_noite")} onChange={set("acorda_noite")} /></Field>
            <Field label="Sintomas noturnos"><FiTextarea name="sintomas_noturnos" placeholder="Boca seca, ronco..." value={g("sintomas_noturnos")} onChange={set("sintomas_noturnos")} /></Field>
            <Field label="HRV (se tiver relógio)"><FiInput name="hrv" placeholder="Ex: 52ms ou Não tenho" value={g("hrv")} onChange={set("hrv")} /></Field>
          </Card>
        </section>

        {/* 09 — Neurológico */}
        <section>
          <SecHead num="09" title="Como você se sente" />
          <p className="text-xs text-muted-foreground mb-3">Avalie de 0 (péssimo) a 10 (excelente) — últimos 30 dias.</p>
          <Card>
            {NEURO_SLIDERS.map(s => {
              const val = parseInt(g(s.key) || "5");
              return (
                <div key={s.key} className="space-y-1">
                  <div className="flex justify-between items-center"><label className="text-xs text-muted-foreground">{s.label}</label><span className="text-primary text-xs font-bold">{val}/10</span></div>
                  <input type="range" min={0} max={10} value={val} onChange={e => set(s.key)(e.target.value)} className="w-full accent-primary" />
                </div>
              );
            })}
            <Field label="Observações"><FiTextarea name="obs_neuro" placeholder="Foco, memória, disposição..." value={g("obs_neuro")} onChange={set("obs_neuro")} /></Field>
          </Card>
        </section>

        {/* 10 — Saúde por gênero */}
        {gender === "F" && (
          <section>
            <SecHead num="10" title="Saúde Feminina" />
            <Card label="Ciclo e TPM">
              <Field label="Ciclo Menstrual"><Choices cols={3} group="ciclo_regular" state={groups} setState={setGroups} options={[{ value: "Regular", theme: "green" }, { value: "Irregular", theme: "amber" }, { value: "Ausente" }]} /></Field>
              <Field label="Sintomas de TPM">
                <div className="flex flex-wrap gap-2">
                  {["Inchaço","Oscilação de humor","Cólicas","Fadiga","Insônia","Ansiedade","Enxaqueca","Compulsão","Sem sintomas"].map(v => (
                    <button key={v} type="button" onClick={() => toggleMulti(tpm, setTpm, v, v === "Sem sintomas")} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all", tpm.includes(v) ? "border-primary bg-primary/15 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/40")}>{v}</button>
                  ))}
                </div>
              </Field>
            </Card>
            <Card label="Queda Capilar">
              <Field label="Onde percebe?">
                <div className="flex flex-wrap gap-2">
                  {["Topo","Franja","Têmporas","Difuso","Nenhuma"].map(v => (
                    <button key={v} type="button" onClick={() => toggleMulti(quedaF, setQuedaF, v, v === "Nenhuma")} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-all", quedaF.includes(v) ? "border-primary bg-primary/15 text-primary" : "border-border/50 text-muted-foreground hover:border-primary/40")}>{v}</button>
                  ))}
                </div>
              </Field>
              <Field label="Fator desencadeante suspeito"><FiInput name="queda_causa_f" placeholder="Ex: pós-parto, stress" value={g("queda_causa_f")} onChange={set("queda_causa_f")} /></Field>
            </Card>
          </section>
        )}

        {gender === "M" && (
          <section>
            <SecHead num="10" title="Saúde Masculina" />
            <Card>
              <Field label="Ereção matinal"><Choices cols={2} group="erecao_matinal" state={groups} setState={setGroups} options={[{ value: "Forte", theme: "green" }, { value: "Normal" }, { value: "Fraca", theme: "amber" }, { value: "Ausente", theme: "red" }]} /></Field>
              <Field label="Queda capilar"><Choices cols={2} group="queda_masc" state={groups} setState={setGroups} options={[{ value: "Sem queda", theme: "green" }, { value: "Entradas" }, { value: "Vértex" }, { value: "Avançada", theme: "red" }]} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Pai (calvície?)"><Choices cols={3} group="hist_pai" state={groups} setState={setGroups} options={[{ value: "Cheio", theme: "green" }, { value: "Parcial" }, { value: "Total" }]} /></Field>
                <Field label="Avô materno"><Choices cols={3} group="hist_avo_mat" state={groups} setState={setGroups} options={[{ value: "Cheio", theme: "green" }, { value: "Parcial" }, { value: "Total" }]} /></Field>
              </div>
            </Card>
          </section>
        )}

        {/* 11 — Histórico clínico */}
        <section>
          <SecHead num="11" title="Histórico clínico" />
          <Card>
            <Field label="Temperatura ao acordar (média 5 dias)"><FiInput name="temperatura" placeholder="Ex: 36.4 °C" value={g("temperatura")} onChange={set("temperatura")} /></Field>
            <Field label="Doenças pré-existentes / Família"><FiTextarea name="doencas" placeholder="Ex: Hipotireoidismo. Nenhuma." value={g("doencas")} onChange={set("doencas")} /></Field>
            <Field label="Mudanças negativas nos últimos 3 anos"><FiTextarea name="mudancas_neg" placeholder="Ex: Imunidade baixa, queda de cabelo..." value={g("mudancas_neg")} onChange={set("mudancas_neg")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cirurgias"><FiInput name="cirurgias" placeholder="Nenhuma." value={g("cirurgias")} onChange={set("cirurgias")} /></Field>
              <Field label="Canal dentário"><FiInput name="canal" placeholder="Nenhum." value={g("canal")} onChange={set("canal")} /></Field>
            </div>
            <Field label="Implantes / Metal"><FiInput name="implantes" placeholder="DIU, pinos, placa..." value={g("implantes")} onChange={set("implantes")} /></Field>
            <Field label="Observações finais"><FiTextarea name="obs_finais" placeholder="Algo importante não perguntado..." value={g("obs_finais")} onChange={set("obs_finais")} /></Field>
          </Card>
        </section>

        {/* 12 — Fotos */}
        <section>
          <SecHead num="12" title="Fotos de Avaliação" />
          <Card>
            <div className="bg-card/50 border border-border/30 rounded-lg p-3 mb-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">📸 Mesmo protocolo sempre — para comparação real</p>
              {[["☀","Mesma luz natural — preferencialmente manhã"],["⏰","Mesmo horário — em jejum, antes de qualquer refeição"],["🩳", gender === "F" ? "Top esportivo e short de treino" : "Sunga, cueca boxer ou short de treino"],["📍","Mesmo local, mesma distância, fundo neutro"],["🧍","Postura semi-relaxada — sem sugar a barriga"]].map(([icon, text]) => (
                <div key={text} className="flex items-start gap-2 text-xs text-muted-foreground"><span>{icon}</span><span>{text}</span></div>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {(["frente","lateral_dir","lateral_esq","costas"] as const).map(k => (
                <FotoSlot key={k} label={k === "frente" ? "Frente" : k === "lateral_dir" ? "Lado Dir." : k === "lateral_esq" ? "Lado Esq." : "Costas"} preview={fotoPreviews[k]} onFile={f => setFoto(k, f)} onRemove={() => { setFotoFiles(p => ({ ...p, [k]: null })); setFotoPreviews(p => ({ ...p, [k]: null })); }} />
              ))}
            </div>
          </Card>
        </section>

        {/* Botão enviar */}
        <Button size="lg" className="w-full h-14 text-base font-bold glow-primary" onClick={handleSubmit} disabled={saving}>
          {saving
            ? isEditMode ? "Salvando alterações..." : "Criando conta e finalizando..."
            : isEditMode ? "Salvar alterações" : "Finalizar Cadastro"}
        </Button>
      </div>

      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-card border border-border px-5 py-3 rounded-xl text-sm shadow-lg z-50 whitespace-nowrap">{toast}</div>}
    </div>
  );
};

export default Anamnesis;
