// Shared CORS helper. Allow only known production/preview origins.
const ALLOWED_ORIGINS = new Set<string>([
  "https://app.eliteprimehub.com.br",
  "https://dynamic-plan-pro.lovable.app",
]);
// Lovable preview subdomains (e.g. id-preview--<id>.lovable.app, <slug>.lovable.app)
const LOVABLE_PREVIEW_RE = /^https:\/\/[a-z0-9-]+\.lovable\.app$/i;

export function buildCorsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && (ALLOWED_ORIGINS.has(origin) || LOVABLE_PREVIEW_RE.test(origin))
      ? origin
      : "https://app.eliteprimehub.com.br";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}