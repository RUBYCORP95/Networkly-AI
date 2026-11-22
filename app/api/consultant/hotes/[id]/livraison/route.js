import { requireConsultant } from "../../../../../../lib/auth/consultant";
import { hostUuid, meetingOrderDeliveryMode, meetingOrderReviewed } from "../../../../../../lib/crm/hosts.mjs";
import { readMeetingOrders } from "../../../../../../lib/crm/meeting-orders";
import { makeMeetingDeliveryPdf } from "../../../../../../lib/crm/meeting-delivery.mjs";
import { createServerSupabase } from "../../../../../../lib/supabase/server";

export async function GET(_request, { params }) {
  const { id } = await params;
  if (!hostUuid.test(id)) return new Response(null, { status: 404 });
  const db = await createServerSupabase();
  const access = await requireConsultant(db);
  if (!access.ok) return new Response(null, { status: access.status });

  const owner = access.user.id;
  const session = await db.from("crm_host_sessions").select("host_name,starts_on,delivery_address,delivery_mode,venue")
    .eq("id", id).eq("owner_id", owner).eq("kind", "meeting").eq("status", "closed")
    .maybeSingle();
  if (session.error) return new Response(null, { status: 500 });
  if (!session.data) return new Response(null, { status: 404 });

  const { data, error } = await readMeetingOrders(db, id, { owner });
  if (error) return new Response(null, { status: 500 });
  const orders = data.filter(order => meetingOrderDeliveryMode(order, session.data) === "grouped");
  if (!orders.length) return new Response(null, { status: 404 });
  if (orders.some(order => !meetingOrderReviewed(order))) {
    return new Response("Valide les paiements des bons rattachés avant de télécharger le bon groupé.", { status: 409 });
  }

  return new Response(await makeMeetingDeliveryPdf(session.data, orders), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="livraison-reunion-${session.data.starts_on}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
