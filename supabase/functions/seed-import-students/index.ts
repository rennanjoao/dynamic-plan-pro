import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

interface SeedUser {
  email: string;
  password: string;
  full_name: string;
}

Deno.serve(async (req: Request) => {
  const cors = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { users, coach_id } = (await req.json()) as { users: SeedUser[]; coach_id: string };
    const out: { email: string; user_id: string; created: boolean }[] = [];

    for (const u of users) {
      // Try fetch existing
      const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = existing?.users.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());
      let user_id: string;
      let created = false;
      if (found) {
        user_id = found.id;
      } else {
        const { data, error } = await admin.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: { full_name: u.full_name },
        });
        if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
        user_id = data.user!.id;
        created = true;
      }

      // Ensure profile row
      await admin.from("profiles").upsert(
        { user_id, full_name: u.full_name, email: u.email },
        { onConflict: "user_id" },
      );
      // Ensure role 'user'
      await admin.from("user_roles").upsert(
        { user_id, role: "user" },
        { onConflict: "user_id,role" },
      );
      // Link to coach
      await admin.from("coach_students").upsert(
        { coach_id, student_id: user_id, status: "active" },
        { onConflict: "coach_id,student_id" },
      );

      out.push({ email: u.email, user_id, created });
    }
    return new Response(JSON.stringify({ ok: true, users: out }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});