import { publicCatalogue } from "../../../../lib/public-catalogue/server";

export async function POST(request, { params }) {
  const { id } = await params;
  if (request.headers.get("sec-fetch-site") !== "same-origin") return new Response(null, { status: 403 });
  const catalogue = await publicCatalogue(id, null);
  if (!catalogue) return new Response(null, { status: 404 });
  const { error } = await catalogue.db.rpc("count_public_catalogue_visit", { catalogue: id });
  return new Response(null, { status: error ? 503 : 204 });
}
