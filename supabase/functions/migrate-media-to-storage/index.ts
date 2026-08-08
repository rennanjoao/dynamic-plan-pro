// Migração retroativa: baixa fotos/exames legados do Cloudinary e regrava no
// bucket PRIVADO `student-media`, reescrevendo os payloads de anamnesis e
// check_ins com o caminho do storage. Idempotente: valores já migrados
// (não-http) são ignorados. Somente admin pode executar.
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildCorsHeaders } from "../_shared/cors.ts";

const BUCKET = "student-media";
const POSES = ["frente", "front", "lateral_dir", "lateral_esq", "costas"];

function extFromUrl(url: string, fallback: string) {
  const m = url.split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
  return (m?.[1] || fallback).toLowerCase();
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) throw new Error("Não autenticado");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: claims } = await admin.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) throw new Error("Não autenticado");
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Acesso negado");

    const dryRun = new URL(req.url).searchParams.get("dry_run") === "1";
    const report = { anamnesis: 0, check_ins: 0, files: 0, failures: [] as string[] };

    const migrateFile = async (studentId: string, url: string, folder: "fotos" | "exames") => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`download ${res.status}`);
      const blob = await res.blob();
      const ext = extFromUrl(url, folder === "fotos" ? "jpg" : "pdf");
      const path = `${studentId}/${folder}/legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await admin.storage.from(BUCKET).upload(path, blob, {
        contentType: blob.type || (folder === "fotos" ? "image/jpeg" : "application/pdf"),
        upsert: false,
      });
      if (error) throw error;
      report.files++;
      return path;
    };

    const migrateRow = async (
      table: "anamnesis" | "check_ins",
      row: { id: string; student_id: string; payload: Record<string, unknown> | null; photo_url?: string | null },
    ) => {
      const payload = { ...(row.payload || {}) } as Record<string, unknown>;
      let changed = false;

      const fotos = { ...((payload.fotos as Record<string, string>) || {}) };
      for (const k of POSES) {
        const v = fotos[k];
        if (typeof v === "string" && /^https?:/i.test(v)) {
          if (!dryRun) fotos[k] = await migrateFile(row.student_id, v, "fotos");
          changed = true;
        }
      }
      if (changed) payload.fotos = fotos;

      const exames = Array.isArray(payload.exames) ? [...(payload.exames as Array<Record<string, unknown>>)] : null;
      if (exames) {
        for (let i = 0; i < exames.length; i++) {
          const u = exames[i]?.url;
          if (typeof u === "string" && /^https?:/i.test(u)) {
            if (!dryRun) exames[i] = { ...exames[i], url: await migrateFile(row.student_id, u, "exames") };
            changed = true;
          }
        }
        if (changed) payload.exames = exames;
      }

      let photoUpdate: Record<string, unknown> = {};
      if (table === "check_ins" && typeof row.photo_url === "string" && /^https?:/i.test(row.photo_url)) {
        photoUpdate = { photo_url: dryRun ? row.photo_url : await migrateFile(row.student_id, row.photo_url, "fotos") };
        changed = true;
      }

      if (!changed) return;
      if (!dryRun) {
        const { error } = await admin.from(table).update({ payload, ...photoUpdate }).eq("id", row.id);
        if (error) throw error;
      }
      report[table]++;
    };

    for (const table of ["anamnesis", "check_ins"] as const) {
      const cols = table === "check_ins" ? "id, student_id, payload, photo_url" : "id, student_id, payload";
      const { data, error } = await admin.from(table).select(cols).limit(2000);
      if (error) throw error;
      for (const row of (data || []) as unknown as Array<{ id: string; student_id: string; payload: Record<string, unknown> | null; photo_url?: string | null }>) {
        try {
          await migrateRow(table, row);
        } catch (e) {
          report.failures.push(`${table}:${row.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, dryRun, ...report }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "erro" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
