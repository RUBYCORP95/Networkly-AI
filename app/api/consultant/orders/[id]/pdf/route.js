import { requireConsultant } from "../../../../../../lib/auth/consultant";
import { makeOrderPdf } from "../../../../../../lib/crm/order-pdf.mjs";
import { orderFields, receiptNumber } from "../../../../../../lib/crm/order-receipt.mjs";
import { createServerSupabase } from "../../../../../../lib/supabase/server";

export async function GET(_request, { params }) {
  const db = await createServerSupabase();
  const access = await requireConsultant(db);
  if (!access.ok) return new Response(null, { status: access.status });

  const { id } = await params;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) {
    return new Response(null, { status: 404 });
  }
  const { data: order, error } = await db.from("crm_orders").select(orderFields).eq("id", id).maybeSingle();
  if (error) return new Response(null, { status: 500 });
  if (!order) return new Response(null, { status: 404 });

  return new Response(await makeOrderPdf(order), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${receiptNumber(id)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
