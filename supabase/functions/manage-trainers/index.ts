import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type UserRoleRow = { user_id: string; role: "user" | "coach" | "admin" };
type ListedUser = { id: string; email?: string | null; created_at?: string };

const errorMessage = (error: unknown) => error instanceof Error ? error.message : "Erro inesperado";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error("Não autenticado");

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: isAdmin } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "admin",
    });
    const { data: isCoach } = await adminClient.rpc("has_role", {
      _user_id: user.id,
      _role: "coach",
    });

    const body = await req.json();
    const { action } = body;

    // Public-ish action (any authenticated user) for anamnesis coach picker
    const publicActions = ["list-coaches"];
    // Coach-or-admin actions
    const coachActions = ["find-student-by-email"];

    if (!publicActions.includes(action)) {
      if (coachActions.includes(action)) {
        if (!isAdmin && !isCoach) throw new Error("Acesso negado");
      } else {
        if (!isAdmin) throw new Error("Acesso negado");
      }
    }

    // ── FIND STUDENT BY EMAIL (coach linking) ──
    if (action === "find-student-by-email") {
      const { email } = body;
      if (!email) throw new Error("Email é obrigatório");

      const { data: list, error: listErr } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (listErr) throw listErr;

      const match = (list.users as ListedUser[]).find(
        (u) => (u.email || "").toLowerCase() === String(email).toLowerCase()
      );
      if (!match) {
        return new Response(JSON.stringify({ student: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: profile } = await adminClient
        .from("profiles")
        .select("full_name")
        .eq("user_id", match.id)
        .maybeSingle();

      const { data: studentProfile } = await adminClient
        .from("student_profiles")
        .select("full_name")
        .eq("user_id", match.id)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          student: {
            id: match.id,
            email: match.email,
            full_name:
              studentProfile?.full_name || profile?.full_name || match.email,
          },
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── LIST coaches/trainers ──
    if (action === "list") {
      const { data: roles } = await adminClient
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["user", "coach"]);

      const roleRows = (roles || []) as UserRoleRow[];
      const userIds = roleRows
        .map((r) => r.user_id)
        .filter((id: string) => id !== user.id);

      const trainers = [];
      for (const id of userIds) {
        const { data: { user: trainerUser } } = await adminClient.auth.admin.getUserById(id);
        if (trainerUser) {
          const { data: profile } = await adminClient
            .from("profiles")
            .select("full_name, team_name, notification_email, invite_code")
            .eq("user_id", id)
            .single();

          const role = roleRows.find((r) => r.user_id === id)?.role || "user";

          trainers.push({
            id: trainerUser.id,
            email: trainerUser.email,
            full_name: profile?.full_name || null,
            team_name: profile?.team_name || null,
            notification_email: profile?.notification_email || null,
            invite_code: profile?.invite_code || null,
            role,
            created_at: trainerUser.created_at,
          });
        }
      }

      return new Response(JSON.stringify({ trainers }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── CREATE trainer/coach ──
    if (action === "create") {
      const { email, password, fullName, teamName, notificationEmail, role: targetRole } = body;
      if (!email || !password || !fullName) {
        throw new Error("Email, senha e nome são obrigatórios");
      }

      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });

      if (createError) throw createError;

      // Set role (coach or user) — upsert to be resilient even if the
      // handle_new_user trigger didn't create the default row.
      const assignRole = targetRole === "coach" ? "coach" : "user";
      await adminClient
        .from("user_roles")
        .delete()
        .eq("user_id", newUser.user.id);
      await adminClient
        .from("user_roles")
        .insert({ user_id: newUser.user.id, role: assignRole });

      // Ensure a profiles row exists so invite_code/notification_email edits work
      const trialEndsAt =
        assignRole === "coach"
          ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
          : null;
      await adminClient
        .from("profiles")
        .upsert({
          user_id: newUser.user.id,
          full_name: fullName,
          team_name: teamName || null,
          email,
          notification_email: notificationEmail || email,
          ...(trialEndsAt ? { trial_ends_at: trialEndsAt } : {}),
        }, { onConflict: "user_id" });

      return new Response(JSON.stringify({ success: true, userId: newUser.user.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── UPDATE PASSWORD ──
    if (action === "update-password") {
      const { trainerId, password } = body;
      if (!trainerId) throw new Error("ID do profissional é obrigatório");
      if (!password || String(password).length < 6) throw new Error("A senha deve ter no mínimo 6 caracteres");

      const { error } = await adminClient.auth.admin.updateUserById(trainerId, {
        password: String(password),
      });
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── DELETE ──
    if (action === "delete") {
      const { trainerId } = body;
      if (!trainerId) throw new Error("ID do treinador é obrigatório");
      if (trainerId === user.id) throw new Error("Não é possível remover a si mesmo");

      const { error } = await adminClient.auth.admin.deleteUser(trainerId);
      if (error) throw error;

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── LIST COACHES (public-ish, for anamnesis coach selection) ──
    if (action === "list-coaches") {
      const { data: coachRoles } = await adminClient
        .from("user_roles")
        .select("user_id")
        .eq("role", "coach");

      const coaches = [];
      for (const r of coachRoles || []) {
        const { data: profile } = await adminClient
          .from("profiles")
          .select("full_name, team_name")
          .eq("user_id", r.user_id)
          .single();

        coaches.push({
          id: r.user_id,
          full_name: profile?.full_name || "Coach",
          team_name: profile?.team_name || null,
        });
      }

      return new Response(JSON.stringify({ coaches }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Ação inválida");
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: errorMessage(error) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
