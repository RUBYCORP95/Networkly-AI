import { requireConsultant } from "../../../../../../lib/auth/consultant";
import { hostUuid } from "../../../../../../lib/crm/hosts.mjs";
import { makeMeetingDeliveryPdf } from "../../../../../../lib/crm/meeting-delivery.mjs";
import { createServerSupabase } from "../../../../../../lib/supabase/server";

export async function GET(_request, { params }) {
  const { id } = await params;
  if (!hostUuid.test(id)) return new Response(null, { status: 404 });
  const db = await createServerSupabase();
  const access = await requireConsultant(db);
  if (!access.ok) return new Response(null, { status: access.status });

  const owner = access.user.id;
  const session = await db.from("crm_host_sessions").select("host_name,starts_on,delivery_address,venue")
    .eq("id", id).eq("owner_id", owner).eq("kind", "meeting").eq("status", "closed")
    .eq("delivery_mode", "grouped").maybeSingle();
  if (session.error) return new Response(null, { status: 500 });
  if (!session.data) return new Response(null, { status: 404 });

  const orders = [];
  const batchSize = 250;
  let lastId = null;
  while (true) {
    let query = db.from("crm_orders").select("id,items").eq("host_session_id", id).eq("owner_id", owner)
      .neq("status", "cancelled").order("id").limit(batchSize);
    if (lastId) query = query.gt("id", lastId);
    const { data, error } = await query;
    if (error) return new Response(null, { status: 500 });
    orders.push(...data);
    if (data.length < batchSize) break;
    lastId = data.at(-1).id;
  }

  return new Response(await makeMeetingDeliveryPdf(session.data, orders), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="livraison-reunion-${session.data.starts_on}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
