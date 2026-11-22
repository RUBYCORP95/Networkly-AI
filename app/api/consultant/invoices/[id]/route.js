import { NextResponse } from "next/server";
import { requireConsultant } from "../../../../../lib/auth/consultant";
import { maxInvoiceBytes, uuid } from "../../../../../lib/crm/invoice-archive.mjs";
import { storeImportedInvoice } from "../../../../../lib/crm/invoice-import";
import { createServerSupabase } from "../../../../../lib/supabase/server";

export async function POST(request, { params }) {
  const { id } = await params;
  if (!uuid.test(id)) return new Response(null, { status: 404 });
  const url = new URL("/consultant/clients", request.url);
  url.search = new URLSearchParams({ client: id, view: "invoices" });
  const finish = result => {
    url.searchParams.set("result", result);
    return NextResponse.redirect(url, 303);
  };

  if (request.headers.get("sec-fetch-site") === "cross-site") return new Response(null, { status: 403 });
  const db = await createServerSupabase();
  const access = await requireConsultant(db);
  if (!access.ok) return new Response(null, { status: access.status });
  if (Number(request.headers.get("content-length")) > maxInvoiceBytes + 16384) return finish("invoice_invalid");
  const form = await request.formData().catch(() => null);
  if (!form) return finish("invoice_invalid");
  try {
    const code = await storeImportedInvoice(db, access.user.id, form, id);
    return finish(({ saved: "invoice", duplicate: "invoice_duplicate", amount: "invoice_amount",
      metadata: "invoice_metadata", number: "invoice_metadata", invalid: "invoice_invalid" })[code] ?? "error");
  } catch {
    return finish("error");
  }
}

export async function GET(_request, { params }) {
  const { id } = await params;
  if (!uuid.test(id)) return new Response(null, { status: 404 });
  const db = await createServerSupabase();
  const access = await requireConsultant(db);
  if (!access.ok) return new Response(null, { status: access.status });
  const { data, error } = await db.from("crm_client_invoices").select("filename,pdf").eq("id", id).maybeSingle();
  if (error) return new Response(null, { status: 500 });
  if (!data) return new Response(null, { status: 404 });
  const name = encodeURIComponent(data.filename).replace(/['()*]/g, char => "%" + char.charCodeAt(0).toString(16));
  return new Response(Buffer.from(data.pdf.slice(2), "hex"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "attachment; filename*=UTF-8''" + name,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
