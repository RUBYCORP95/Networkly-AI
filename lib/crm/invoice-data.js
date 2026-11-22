import { invoicePageSize } from "./invoice-archive.mjs";

export const invoiceListFields = "id,document_number,document_date,filename,client_id,order_id,issuer_name,account_number,finance_declared_cents";

function invoiceDates(query, owner, period) {
  query = query.eq("owner_id", owner);
  return period.from ? query.gte("document_date", period.from).lte("document_date", period.to) : query;
}

export function listInvoices(db, owner, period, page) {
  return invoiceDates(db.from("crm_client_invoices").select(invoiceListFields, { count: "exact" }), owner, period)
    .order("account_number", { nullsFirst: false }).order("issuer_key")
    .order("document_date", { ascending: false }).order("id", { ascending: false })
    .range((page - 1) * invoicePageSize, page * invoicePageSize - 1);
}

export function exportInvoicePage(db, owner, period, cutoff, cursor) {
  let query = invoiceDates(db.from("crm_client_invoices").select(invoiceListFields), owner, period)
    .lte("uploaded_at", cutoff);
  if (cursor) {
    query = query.or(`document_date.lt.${cursor.document_date},and(document_date.eq.${cursor.document_date},id.lt.${cursor.id})`);
  }
  return query.order("document_date", { ascending: false }).order("id", { ascending: false }).limit(100);
}

export async function invoiceCustomers(db, owner) {
  const size = 500;
  const customers = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await db.from("crm_clients").select("id,name").eq("owner_id", owner)
      .order("name").order("id").range(from, from + size - 1);
    if (error) throw error;
    customers.push(...data);
    if (data.length < size) return customers;
  }
}
