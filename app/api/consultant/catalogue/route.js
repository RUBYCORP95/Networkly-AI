import { createServerSupabase } from "../../../../lib/supabase/server";
import { requireConsultant } from "../../../../lib/auth/consultant";
import { findProducts, getVariants, matchesArticleCode, requireEuroCatalogue } from "../../../../lib/crm/catalogue";

import { availableOrderLink } from "../../../../lib/crm/order-link";

function rankByArticleCode(items, query) {
  const code = query.toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]*$/.test(code)) return items;

  function rank(item) {
    const reference = item.reference.trim().toUpperCase();
    if (reference === code) return 0;
    if (reference.startsWith(code)) return 1;
    return 2;
  }

  return [...items].sort((left, right) => rank(left) - rank(right));
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  const token = request.headers.get("X-Order-Link");
  if (token) {
    if (!await availableOrderLink(token)) return Response.json({ error: "Lien expiré ou utilisé." }, { status: 403 });
  } else {
    const access = await requireConsultant(await createServerSupabase());
    if (!access.ok) return Response.json({ error: access.error }, { status: access.status });
  }
  const mode = params.get("mode");
  const query = params.get("q")?.trim();
  if (!query || query.length > 240) return Response.json({ error: "Recherche invalide." }, { status: 400 });

  try {
    const [handles] = await Promise.all([findProducts(query, mode), requireEuroCatalogue()]);
    const variants = await Promise.allSettled(handles.map(getVariants));
    const items = variants.flatMap(result => result.status === "fulfilled" ? result.value : []);
    const matches = mode === "code" ? items.filter(item => matchesArticleCode(item, query)) : items;
    if (!matches.length && variants.some(result => result.status === "rejected")) throw new Error("Recherche incomplète");
    return Response.json({ items: mode === "code"
      ? rankByArticleCode(matches, query)
      : mode === "name" ? items : rankByArticleCode(items, query) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Le catalogue Parfum Inspiration est indisponible." }, { status: 502 });
  }
}
