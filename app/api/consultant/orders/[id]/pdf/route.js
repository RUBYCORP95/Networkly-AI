import { requireConsultant } from "../../../../../../lib/auth/consultant";
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
  const { data: order, error } = await db.from("crm_orders").select(orderFields + ",client_id,delivery_address,crm_host_sessions(delivery_mode)").eq("id", id).maybeSingle();
  if (error) return new Response(null, { status: 500 });
  if (!order) return new Response(null, { status: 404 });

  const address = order.crm_host_sessions?.delivery_mode === "individual" ? order.delivery_address : null;
  const pdf = await makeOrderPdf(address ? { ...order, buyer: { ...order.buyer, address } } : order);
  const filename = receiptNumber(id) + ".pdf";
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
