import { requireConsultant } from "../../../../../../lib/auth/consultant";
import { loadHostRewards } from "../../../../../../lib/crm/host-rewards.mjs";
import { makeOrderPdf } from "../../../../../../lib/crm/order-pdf.mjs";
import { orderDate, orderFields, receiptNumber } from "../../../../../../lib/crm/order-receipt.mjs";
import { createServerSupabase } from "../../../../../../lib/supabase/server";

export async function GET(_request, { params }) {
  return downloadOrder(await params, false);
}

export async function POST(request, { params }) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return new Response(null, { status: 403 });
  return downloadOrder(await params, true);
}

async function downloadOrder({ id }, archive) {
  const db = await createServerSupabase();
  const access = await requireConsultant(db);
  if (!access.ok) return new Response(null, { status: access.status });

  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
    return new Response(null, { status: 404 });
  }
  const { data: order, error } = await db.from("crm_orders").select(orderFields + ",client_id,delivery_address,host_session_id,crm_host_sessions(kind,delivery_mode)").eq("id", id).maybeSingle();
  if (error) return new Response(null, { status: 500 });
  if (!order) return new Response(null, { status: 404 });

  const mode = order.meeting_delivery_mode ?? order.crm_host_sessions?.delivery_mode;
  const address = mode === "individual" ? order.delivery_address : null;
  const { rewards, error: rewardsError } = order.crm_host_sessions?.kind === "meeting"
    ? await loadHostRewards(db, access.user.id, order.host_session_id) : { rewards: [] };
  if (rewardsError) return new Response(null, { status: 500 });
  const pdf = await makeOrderPdf(address ? { ...order, buyer: { ...order.buyer, address } } : order, rewards);
  const filename = receiptNumber(order) + ".pdf";
  if (archive) {
    const { error: archiveError } = await db.from("crm_client_invoices").upsert({
      client_id: order.client_id, order_id: id, document_date: orderDate(order),
      filename, pdf: "\\x" + Buffer.from(pdf).toString("hex"),
    }, { onConflict: "order_id" });
    if (archiveError) {
      return new Response("Le bon n’a pas pu être archivé. Réessaie dans un instant.", { status: 500 });
    }
  }
  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
