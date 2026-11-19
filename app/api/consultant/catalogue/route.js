import { createServerSupabase } from "../../../../lib/supabase/server";
import { requireConsultant } from "../../../../lib/auth/consultant";
import { findProducts, getVariants, requireEuroCatalogue } from "../../../../lib/crm/catalogue";

export async function GET(request) {
  const access = await requireConsultant(await createServerSupabase());
  if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || query.length > 240) return Response.json({ error: "Recherche invalide." }, { status: 400 });

  try {
    const [handles] = await Promise.all([findProducts(query), requireEuroCatalogue()]);
    const items = (await Promise.all(handles.map(getVariants))).flat();
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Le catalogue Parfum Inspiration est indisponible." }, { status: 502 });
  }
}
