import { createAdminSupabase } from "../../../../lib/supabase/admin";

export async function GET() {
  const { data, error } = await createAdminSupabase().from("subscription_prices").select("code,cents");
  const headers = { "Cache-Control": "no-store" };
  if (error) return Response.json({ error: "Tarifs momentanément indisponibles." }, { status: 503, headers });
  return Response.json({ prices: Object.fromEntries(data.map(row => [row.code, row.cents])) }, { headers });
}
