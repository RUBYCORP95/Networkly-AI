import { NextResponse } from "next/server";
import { requireConsultant } from "../../../../../lib/auth/consultant";
import { isDate, parisDate } from "../../../../../lib/crm/dates.mjs";
import { createServerSupabase } from "../../../../../lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxPdfBytes = 3 * 1024 * 1024;

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
  if (Number(request.headers.get("content-length")) > maxPdfBytes + 8192) return finish("invoice_invalid");

  const form = await request.formData().catch(() => null);
  const file = form?.get("invoice");
  const document_date = form?.get("document_date");
  if (!isDate(document_date) || document_date > parisDate()) return finish("invoice_invalid");
  if (!(file instanceof Blob) || !file.name || !/\.pdf$/i.test(file.name) ||
      file.size < 6 || file.size > maxPdfBytes) return finish("invoice_invalid");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.toString("ascii", 0, 5) !== "%PDF-") return finish("invoice_invalid");
  const filename = Array.from(file.name.replace(/[\p{C}/\\]/gu, "_").trim().replace(/\.pdf$/i, ""))
    .slice(0, 176).join("") + ".pdf";
  const { error } = await db.from("crm_client_invoices").insert({
    client_id: id, document_date, filename, pdf: "\\x" + bytes.toString("hex"),
  });
  return finish(error ? "error" : "invoice");
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
