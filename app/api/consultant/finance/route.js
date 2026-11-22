import { NextResponse } from "next/server";
import { requireConsultant } from "../../../../lib/auth/consultant";
import { isDate } from "../../../../lib/crm/dates.mjs";
import { categories, financePath, financePeriod } from "../../../../lib/crm/finance.mjs";
import { loadFinance } from "../../../../lib/crm/finance-data";
import { financeExcel, financePdf } from "../../../../lib/crm/finance-exports";
import { parseCents } from "../../../../lib/crm/money.mjs";
import { createServerSupabase } from "../../../../lib/supabase/server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const maxBytes = 3 * 1024 * 1024;
const fileTypes = [
  ["application/pdf", "255044462d"],
  ["image/jpeg", "ffd8ff"],
  ["image/png", "89504e470d0a1a0a"],
];

async function receiptFields(form) {
  const file = form.get("receipt");
  if (!(file instanceof Blob) || !file.size) {
    return form.get("remove_receipt") === "yes" ? { receipt_name: null, receipt_mime: null, receipt: null } : {};
  }
  if (file.size < 8 || file.size > maxBytes) return null;
  const bytes = Buffer.from(await file.arrayBuffer());
  const prefix = bytes.subarray(0, 8).toString("hex");
  const type = fileTypes.find(([, signature]) => prefix.startsWith(signature));
  if (!type) return null;
  const name = Array.from(file.name.replace(/[\p{C}/\\]/gu, "_").trim()).slice(0, 176).join("");
  return { receipt_name: name || "Justificatif", receipt_mime: type[0], receipt: "\\x" + bytes.toString("hex") };
}

export async function POST(request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return new Response(null, { status: 403 });
  const db = await createServerSupabase();
  const access = await requireConsultant(db);
  if (!access.ok) return new Response(null, { status: access.status });

  const url = new URL(financePath, request.url);
  const finish = result => {
    url.searchParams.set("result", result);
    return NextResponse.redirect(url, 303);
  };
  if (Number(request.headers.get("content-length")) > maxBytes + 16384) return finish("file");
  const form = await request.formData().catch(() => null);
  if (!form) return finish("invalid");
  const period = financePeriod(Object.fromEntries(form));
  url.search = period.query;
  const owner = access.user.id;
  const id = form.get("id");
  const operation = form.get("operation");

  if (operation === "cost") {
    const cost = parseCents(form.get("cost"));
    if (!uuid.test(id) || Number.isNaN(cost)) return finish("invalid");
    const { data, error } = await db.from("crm_orders").update({ product_cost_cents: cost })
      .eq("owner_id", owner).eq("id", id).select("id").maybeSingle();
    return finish(data && !error ? "saved" : "error");
  }

  if (operation === "invoice" || operation === "archive") {
    if (!uuid.test(id)) return finish("invalid");
    const reference = String(form.get("reference") ?? "").trim();
    const amount = parseCents(form.get("amount"));
    const cost = parseCents(form.get("cost"));
    const payment = form.get("payment");
    if (operation === "invoice" && (!reference || reference.length > 80 ||
      !Number.isInteger(amount) || Number.isNaN(cost) || !["pending", "paid"].includes(payment) ||
      form.get("distinct") !== "yes")) return finish("invalid");
    const values = operation === "archive"
      ? { finance_excluded: true, finance_reference: null, finance_amount_cents: null, finance_paid: null, finance_product_cost_cents: null }
      : { finance_excluded: false, finance_reference: reference, finance_amount_cents: amount, finance_paid: payment === "paid", finance_product_cost_cents: cost };
    const { data, error } = await db.from("crm_client_invoices").update(values)
      .eq("owner_id", owner).eq("id", id).is("order_id", null).select("id").maybeSingle();
    if (error?.code === "23505") return finish("duplicate");
    return finish(data && !error ? "saved" : "error");
  }

  if (operation === "delete") {
    if (!uuid.test(id)) return finish("invalid");
    const { data, error } = await db.from("crm_finance_entries").delete()
      .eq("owner_id", owner).eq("id", id).select("id").maybeSingle();
    return finish(data && !error ? "deleted" : "error");
  }
  if (operation !== "entry" || (id && !uuid.test(id))) return finish("invalid");

  const entry_date = form.get("entry_date");
  const category = form.get("category");
  const label = String(form.get("label") ?? "").trim();
  const amount_cents = parseCents(form.get("amount"));
  if (!isDate(entry_date) || entry_date > period.today || !Object.hasOwn(categories, category) ||
      !label || label.length > 120 || !Number.isInteger(amount_cents) || amount_cents < 1) return finish("invalid");
  const receipt = await receiptFields(form);
  if (!receipt) return finish("file");
  const values = { entry_date, category, label, amount_cents, ...receipt };
  const table = db.from("crm_finance_entries");
  const query = id ? table.update(values).eq("owner_id", owner).eq("id", id) : table.insert(values);
  const { data, error } = await query.select("id").maybeSingle();
  return finish(data && !error ? (entry_date >= period.start && entry_date <= period.to ? "saved" : "outside") : "error");
}

function download(content, name, type) {
  const filename = encodeURIComponent(name).replace(/['()*]/g, char => "%" + char.charCodeAt(0).toString(16));
  return new Response(content, {
    headers: {
      "Content-Type": type,
      "Content-Disposition": "attachment; filename*=UTF-8''" + filename,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function GET(request) {
  const db = await createServerSupabase();
  const access = await requireConsultant(db);
  if (!access.ok) return new Response(null, { status: access.status });
  const params = new URL(request.url).searchParams;
  const receipt = params.get("receipt");
  const owner = access.user.id;

  if (receipt) {
    if (!uuid.test(receipt)) return new Response(null, { status: 404 });
    const { data, error } = await db.from("crm_finance_entries").select("receipt,receipt_name,receipt_mime")
      .eq("owner_id", owner).eq("id", receipt).maybeSingle();
    if (error) return new Response(null, { status: 500 });
    if (!data?.receipt) return new Response(null, { status: 404 });
    return download(Buffer.from(data.receipt.slice(2), "hex"), data.receipt_name, data.receipt_mime);
  }

  const format = params.get("format");
  if (format !== "xlsx" && format !== "pdf") return new Response(null, { status: 404 });
  const period = financePeriod(Object.fromEntries(params));
  if (period.invalid) return new Response("Vérifie les dates de début et de fin.", { status: 400 });
  const basename = "tesami-finances-" + period.start + "-" + (period.type === "range" ? period.to : period.type);
  try {
    const data = await loadFinance(db, owner, period);
    return format === "pdf"
      ? download(await financePdf(data), basename + ".pdf", "application/pdf")
      : download(financeExcel(data), basename + ".xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  } catch (error) {
    console.error("Finance export:", error.message);
    return new Response("Export temporairement indisponible.", { status: 500 });
  }
}
