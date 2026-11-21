import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const reply = (body, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request) {
  const token = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") || "")?.[1];
  if (!token) return reply({ error: "Connexion requise." }, 401);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon || !service) return reply({ error: "LeadFactory indisponible." }, 503);

  const auth = { persistSession: false, autoRefreshToken: false };
  const client = createClient(url, anon, { auth });
  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError || !user) return reply({ error: "Session invalide." }, 401);

  const body = await request.json().catch(() => null);
  const action = body?.action;
  const allocationId = action === "reveal" ? body?.allocationId : null;
  const uuid = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;
  if (action !== "generate" && (action !== "reveal" || typeof allocationId !== "string" || !uuid.test(allocationId))) {
    return reply({ error: "Action invalide." }, 400);
  }

  const db = createClient(url, service, { auth });
  const { data, error } = await db.rpc("leadfactory_consultant_action", {
    p_user_id: user.id,
    p_action: action,
    p_allocation_id: allocationId
  });
  if (!error && data) return reply(data);
  if (error?.code === "42501") return reply({ error: "Accès LeadFactory non autorisé." }, 403);
  if (error?.message === "valid sector and geolocation required" || error?.message === "location required") {
    return reply({ error: "Choisis une commune et un rayon entre 5 et 50 km." }, 422);
  }
  if (action === "reveal" && (error?.message === "allocation expired or unavailable" || error?.message === "contact no longer eligible")) {
    return reply({ error: "Ce contact n’est plus disponible." }, 404);
  }
  if (error?.message === "request not pending") return reply({ error: "La demande du jour ne peut plus être traitée." }, 409);
  console.error("LeadFactory action failed", { action, code: error?.code });
  return reply({ error: "LeadFactory est temporairement indisponible." }, 503);
}
