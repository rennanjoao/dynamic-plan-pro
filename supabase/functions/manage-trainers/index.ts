import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { buildCorsHeaders } from "../_shared/cors.ts";
type UserRoleRow = { user_id: string; role: "user" | "coach" | "admin" };
type ListedUser = { id: string; email?: string | null; created_at?: string };

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Erro inesperado";

function generateToken(length = 32): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let token = "";
  for (let i = 0; i < length; i++) {
    token += chars[Math.floor(Math.random() * chars.length)];
  }
  return token;
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader || "" } },
    });
    
    // Tenta pegar o usuário, mas não bloqueia imediatamente (para permitir ações públicas)
    const { data: { user } } = await userClient.auth.getUser();
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { action } = body;

    // Ações públicas que não exigem token JWT
    const publicActions = ["list-coaches", "validate-coach-invite", "register-via-invite"];
    // Ações que Coach ou Admin podem acessar
    const coachActions = ["find-student-by-email"];

    let isAdmin = false;
    let isCoach = false;

    if (user) {
      const { data: adminData } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "admin" });
      isAdmin = adminData;
      const { data: coachData } = await adminClient.rpc("has_role", { _user_id: user.id, _role: "coach" });
      isCoach = coachData;
    }

    // Validação de Permissões baseada na ação
    if (!publicActions.includes(action)) {
      if (!user) throw new Error("Não autenticado");
      if (coachActions.includes(action)) {
        if (!isAdmin && !isCoach) throw new Error("Acesso negado");
      } else {
        if (!isAdmin) throw new Error("Acesso negado");
      }
    }

    // ── VALIDATE COACH INVITE (public) ──
    if (action === "validate-coach-invite") {
      const { token } = body;
      if (!token) throw new Error("Token é obrigatório");

      const { data: invite } = await adminClient
        .from("coach_invites")
        .select("id, email, expires_at, used_at")
        .eq("token", token)
        .maybeSingle();

      if (!invite) return new Response(JSON.stringify({ valid: false, reason: "Token inválido" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (invite.used_at) return new Response(JSON.stringify({ valid: false, reason: "Token já utilizado" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (new Date(invite.expires_at) < new Date()) return new Response(JSON.stringify({ valid: false, reason: "Token expirado" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      return new Response(JSON.stringify({ valid: true, invite_id: invite.id, email: invite.email }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── REGISTER VIA INVITE (public) ──
    if (action === "register-via-invite") {
      const { token, fullName, teamName, password, notificationEmail: bodyNotifEmail } = body;
      if (!token || !fullName || !password) throw new Error("Dados incompletos");

      const { data: invite } = await adminClient.from("coach_invites").select("*").eq("token", token).maybeSingle();
      if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
        throw new Error("Token inválido ou expirado");
      }
      if (!invite.email) throw new Error("Convite não possui e-mail vinculado");

      // 1. Cria usuário
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email: invite.email,
        password: password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createError) throw createError;

      // 2. Define Role
      await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role: "coach" });
      
      // 3. Define Profile com 30 dias de trial
      const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      await adminClient.from("profiles").upsert({
        user_id: newUser.user.id,
        full_name: fullName,
        team_name: teamName || null,
        email: invite.email,
        notification_email: bodyNotifEmail || invite.email,
        trial_ends_at: trialEndsAt
      });

      // 4. Invalida Token
      await adminClient.from("coach_invites").update({ used_at: new Date().toISOString() }).eq("id", invite.id);

      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── FIND STUDENT BY EMAIL (coach linking) ──
    if (action === "find-student-by-email") {
      const { email } = body;
      if (!email) throw new Error("Email é obrigatório");

      const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 200 });
      if (listErr) throw listErr;

      const match = (list.users as ListedUser[]).find(
        (u) => (u.email || "").toLowerCase() === String(email).toLowerCase()
      );
      if (!match) return new Response(JSON.stringify({ student: null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

      const { data: profile } = await adminClient.from("profiles").select("full_name").eq("user_id", match.id).maybeSingle();
      const { data: studentProfile } = await adminClient.from("student_profiles").select("full_name").eq("user_id", match.id).maybeSingle();

      return new Response(
        JSON.stringify({ student: { id: match.id, email: match.email, full_name: studentProfile?.full_name || profile?.full_name || match.email } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── LIST coaches/trainers ──
    if (action === "list") {
      const { data: roles } = await adminClient.from("user_roles").select("user_id, role").in("role", ["user", "coach"]);
      const roleRows = (roles || []) as UserRoleRow[];
      const userIds = roleRows.map((r) => r.user_id).filter((id: string) => id !== user?.id);

      const trainers = [];
      for (const id of userIds) {
        const { data: { user: trainerUser } } = await adminClient.auth.admin.getUserById(id);
        if (trainerUser) {
          const { data: profile } = await adminClient.from("profiles").select("full_name, team_name, notification_email, invite_code, trial_ends_at, blocked_until").eq("user_id", id).single();
          const role = roleRows.find((r) => r.user_id === id)?.role || "user";
          trainers.push({
            id: trainerUser.id,
            email: trainerUser.email,
            full_name: profile?.full_name || null,
            team_name: profile?.team_name || null,
            notification_email: profile?.notification_email || null,
            invite_code: profile?.invite_code || null,
            trial_ends_at: profile?.trial_ends_at || null,
            blocked_until: profile?.blocked_until || null,
            role,
            created_at: trainerUser.created_at,
          });
        }
      }

      return new Response(JSON.stringify({ trainers }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── BLOCK USER ──
    if (action === "block-user") {
      const { trainerId, blockedUntil } = body;
      if (!trainerId) throw new Error("ID do usuário é obrigatório");

      const { error } = await adminClient.from("profiles").update({ blocked_until: blockedUntil || null }).eq("user_id", trainerId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── UNBLOCK USER ──
    if (action === "unblock-user") {
      const { trainerId } = body;
      if (!trainerId) throw new Error("ID do usuário é obrigatório");

      const { error } = await adminClient.from("profiles").update({ blocked_until: null }).eq("user_id", trainerId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── GENERATE COACH INVITE (WITH RESEND EMAIL) ──
    if (action === "generate-coach-invite") {
      const { email, expiresInDays = 7, note = "" } = body;
      if (!email) throw new Error("O e-mail do coach é obrigatório");

      const token = generateToken(32);
      const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await adminClient
        .from("coach_invites")
        .insert({ email, token, created_by: user!.id, expires_at: expiresAt, note: note || null })
        .select()
        .single();

      if (error) throw error;

      // Integração com Resend para envio do link
      const resendKey = Deno.env.get("RESEND_API_KEY");
      let emailSent = false;
      let emailError: string | null = null;
      const origin = req.headers.get("origin") || "https://rjelitelab.com.br";
      const inviteLink = `${origin}/register?invite=${token}`;

      if (!resendKey) {
        emailError = "RESEND_API_KEY não configurada";
      } else {
        try {
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: "Elite Prime Hub <noreply@eliteprimehub.com.br>",
              to: [email],
              subject: "Convite Exclusivo — Elite Prime Hub",
              html: `
                <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;background:#0a0a0a;color:#fff;border-radius:12px;">
                  <h2 style="color:#fff;margin:0 0 12px;">Você foi convidado para ser Coach no Elite Prime <span style="color:#E11D48;">Hub</span></h2>
                  <p style="color:#cbd5e1;line-height:1.55;">Clique no botão abaixo para criar sua conta e iniciar seu período de teste de <strong>30 dias</strong>:</p>
                  <p style="margin:24px 0;">
                    <a href="${inviteLink}" style="display:inline-block;padding:12px 22px;background:#E11D48;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Aceitar Convite</a>
                  </p>
                  <p style="color:#94a3b8;font-size:12px;">Ou copie e cole este link no navegador:<br/>${inviteLink}</p>
                  <p style="color:#64748b;font-size:11px;margin-top:24px;">Este convite expira em ${expiresInDays} dia(s) e só pode ser usado uma vez.</p>
                </div>
              `,
            }),
          });
          if (!r.ok) {
            const txt = await r.text();
            emailError = `Resend ${r.status}: ${txt}`;
          } else {
            emailSent = true;
          }
        } catch (e) {
          emailError = e instanceof Error ? e.message : "Falha ao enviar e-mail";
        }
      }

      return new Response(
        JSON.stringify({ success: true, invite: data, inviteLink, emailSent, emailError }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── LIST INVITES ──
    if (action === "list-invites") {
      const { data, error } = await adminClient.from("coach_invites").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return new Response(JSON.stringify({ invites: data || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── LIST ACCESS LOGS ──
    if (action === "list-access-logs") {
      const { limit = 100 } = body;
      const { data, error } = await adminClient.from("access_logs").select("*").order("accessed_at", { ascending: false }).limit(limit);
      if (error) throw error;

      const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const onlineNow = (data || []).filter((l: { accessed_at: string }) => l.accessed_at >= fifteenMinAgo);

      return new Response(JSON.stringify({ logs: data || [], online_now: onlineNow }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── CREATE trainer/coach (MÁQUINA DIRETA) ──
    if (action === "create") {
      const { email, password, fullName, teamName, notificationEmail, role: targetRole } = body;
      if (!email || !password || !fullName) throw new Error("Email, senha e nome são obrigatórios");

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
      if (createError) throw createError;

      const assignRole = targetRole === "coach" ? "coach" : "user";
      await adminClient.from("user_roles").delete().eq("user_id", newUser.user.id);
      await adminClient.from("user_roles").insert({ user_id: newUser.user.id, role: assignRole });

      const trialEndsAt = assignRole === "coach" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;
      await adminClient.from("profiles").upsert({
        user_id: newUser.user.id,
        full_name: fullName,
        team_name: teamName || null,
        email,
        notification_email: notificationEmail || email,
        ...(trialEndsAt ? { trial_ends_at: trialEndsAt } : {}),
      }, { onConflict: "user_id" });

      return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── UPDATE PASSWORD ──
    if (action === "update-password") {
      const { trainerId, password } = body;
      if (!trainerId) throw new Error("ID do profissional é obrigatório");
      if (!password || String(password).length < 6) throw new Error("A senha deve ter no mínimo 6 caracteres");

      const { error } = await adminClient.auth.admin.updateUserById(trainerId, { password: String(password) });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── DELETE ──
    if (action === "delete") {
      const { trainerId } = body;
      if (!trainerId) throw new Error("ID do treinador é obrigatório");
      if (trainerId === user?.id) throw new Error("Não é possível remover a si mesmo");

      const { error } = await adminClient.auth.admin.deleteUser(trainerId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── LIST COACHES (public-ish, for anamnesis coach selection) ──
    if (action === "list-coaches") {
      const { data: coachRoles } = await adminClient.from("user_roles").select("user_id").eq("role", "coach");
      const coaches = [];
      for (const r of coachRoles || []) {
        const { data: profile } = await adminClient.from("profiles").select("full_name, team_name").eq("user_id", r.user_id).single();
        coaches.push({ id: r.user_id, full_name: profile?.full_name || "Coach", team_name: profile?.team_name || null });
      }
      return new Response(JSON.stringify({ coaches }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error("Ação inválida");
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: errorMessage(error) }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
