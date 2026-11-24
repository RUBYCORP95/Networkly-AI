import { createAdminSupabase } from "../../../../../lib/supabase/admin";
import { validSlug } from "../../../../../lib/recruitment/model.mjs";

export async function POST(request, { params }) {
  const { slug } = await params;
  const kind = new URL(request.url).searchParams.get("type");
  const source = request.headers.get("sec-fetch-site");
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (source && source !== "same-origin") return new Response(null, { status: 403, headers });
  if (!validSlug(slug) || !["visit", "whatsapp", "join"].includes(kind)) {
    return new Response(null, { status: 404, headers });
  }
  const { data, error } = await createAdminSupabase().rpc("recruitment_event", { p_slug: slug, p_event: kind });
  if (error) return new Response("Action temporairement indisponible.", { status: 503, headers });
  if (data === null) return new Response("Lien indisponible.", { status: 404, headers });
  if (kind === "visit") return new Response(null, { status: 204, headers });
  return new Response(null, { status: 303, headers: { ...headers, Location: data } });
}
