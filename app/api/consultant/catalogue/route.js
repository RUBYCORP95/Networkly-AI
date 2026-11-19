import { createServerSupabase } from "../../../../lib/supabase/server";
import { requireConsultant } from "../../../../lib/auth/consultant";
import { findProducts, getVariants, requireEuroCatalogue } from "../../../../lib/crm/catalogue";

import { availableOrderLink } from "../../../../lib/crm/order-link";

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const token = request.headers.get("X-Order-Link");
  if (token) {
    if (!await availableOrderLink(token)) return Response.json({ error: "Lien expiré ou utilisé." }, { status: 403 });
  } else {
    const access = await requireConsultant(await createServerSupabase());
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  }
  const query = params.get("q")?.trim();
  if (!query || query.length > 240) return Response.json({ error: "Recherche invalide." }, { status: 400 });

  try {
    const [handles] = await Promise.all([findProducts(query), requireEuroCatalogue()]);
    const items = (await Promise.all(handles.map(getVariants))).flat();
    return Response.json({ items }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Le catalogue Parfum Inspiration est indisponible." }, { status: 502 });
  }
}
