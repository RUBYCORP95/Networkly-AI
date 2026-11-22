import { financeReport } from "./finance.mjs";

async function list(db, table, fields, date, owner, period) {
  const size = 500;
  const rows = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await db.from(table).select(fields).eq("owner_id", owner)
      .gte(date, period.start).lte(date, period.to).order(date, { ascending: false })
      .order("id", { ascending: false }).range(from, from + size - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < size) return rows;
  }
}

export async function loadFinance(db, owner, period) {
  const [sales, entries] = await Promise.all([
    list(db, "crm_finance_sales",
      "id,client_id,sale_date,source,status,payment_status,amount_cents,product_cost_cents,invoice_id,invoice_name,invoice_reference,declared_cents,order_number",
      "sale_date", owner, period),
    list(db, "crm_finance_entries", "id,entry_date,category,label,amount_cents,receipt_name", "entry_date", owner, period),
  ]);
  return financeReport(period, sales, entries);
}
