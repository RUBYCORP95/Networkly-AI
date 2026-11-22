import { requireConsultant } from "../../../../lib/auth/consultant";
import { invoiceAccount, invoiceIssuer, invoiceNature, invoicePeriod, maxInvoiceBytes, uuid } from "../../../../lib/crm/invoice-archive.mjs";
import { exportInvoicePage } from "../../../../lib/crm/invoice-data";
import { invoiceMessages, inspectImportedInvoice, storeImportedInvoice, suggestInvoiceAccount } from "../../../../lib/crm/invoice-import";
import { streamInvoiceZip } from "../../../../lib/crm/invoice-zip.mjs";
import { createServerSupabase } from "../../../../lib/supabase/server";

export const maxDuration = 60;

function failed(code) {
  const status = { error: 500, duplicate: 409, missing: 404 }[code] ?? 422;
  return Response.json({ code, message: invoiceMessages[code] ?? "Facture introuvable." }, { status });
}

export async function POST(request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") return new Response(null, { status: 403 });
  const db = await createServerSupabase();
  const access = await requireConsultant(db);
  if (!access.ok) return new Response(null, { status: access.status });
  if (Number(request.headers.get("content-length")) > maxInvoiceBytes + 16384) return failed("invalid");
  const form = await request.formData().catch(() => null);
  if (!form) return failed("invalid");
  const owner = access.user.id;

  try {
    switch (form.get("mode")) {
      case "inspect": {
        const fields = await inspectImportedInvoice(db, owner, form);
        return fields.code ? failed(fields.code) : Response.json(fields);
      }
      case "save": {
        const code = await storeImportedInvoice(db, owner, form);
        return code === "saved" ? Response.json({ code }, { status: 201 }) : failed(code);
      }
      case "suggest":
        return Response.json({ account: await suggestInvoiceAccount(db, owner, form.get("issuer_name"), invoiceNature(form.get("document_nature"))) });
      case "nature_accounts": {
        const rawSubscription = form.get("subscription_account");
        const rawEquipment = form.get("equipment_account");
        const subscription_account = invoiceAccount(rawSubscription);
        const equipment_account = invoiceAccount(rawEquipment);
        if ((rawSubscription && !subscription_account) || (rawEquipment && !equipment_account)) return failed("metadata");
        const { error } = await db.from("crm_invoice_nature_accounts").upsert({ subscription_account, equipment_account },
          { onConflict: "owner_id" });
        return error ? failed("error") : Response.json({ code: "saved" });
      }
      case "classify": {
        const id = form.get("id");
        const rawIssuer = form.get("issuer_name");
        const rawAccount = form.get("account_number");
        const rawNature = form.get("document_nature");
        const document_nature = invoiceNature(rawNature);
        const issuer_name = invoiceIssuer(rawIssuer);
        const account_number = invoiceAccount(rawAccount);
        if (typeof id !== "string" || !uuid.test(id) || (rawIssuer && !issuer_name) || (rawAccount && !account_number) || (rawNature && !document_nature)) {
          return failed("metadata");
        }
        const { data, error } = await db.from("crm_client_invoices").update({ issuer_name, account_number, ...(rawNature !== null ? { document_nature } : {}) })
          .eq("owner_id", owner).eq("id", id).select("id").maybeSingle();
        if (error) return failed(error.code === "23505" ? "duplicate" : "error");
        return data ? Response.json({ code: "saved" }) : failed("missing");
      }
      default: return failed("invalid");
    }
  } catch {
    return failed("error");
  }
}

async function* exportPdfs(db, owner, period, cutoff, first) {
  let rows = first;
  while (rows.length) {
    for (const row of rows) {
      const { data, error } = await db.from("crm_client_invoices").select("pdf")
        .eq("owner_id", owner).eq("id", row.id).maybeSingle();
      if (error || !data?.pdf) throw new Error("Facture indisponible pendant l’export.");
      yield { ...row, pdf: Buffer.from(data.pdf.slice(2), "hex") };
    }
    if (rows.length < 100) return;
    const next = await exportInvoicePage(db, owner, period, cutoff, rows.at(-1));
    if (next.error) throw new Error("Liste des factures indisponible pendant l’export.");
    rows = next.data;
  }
}

export async function GET(request) {
  const db = await createServerSupabase();
  const access = await requireConsultant(db);
  if (!access.ok) return new Response(null, { status: access.status });
  const params = new URL(request.url).searchParams;
  if (params.get("format") !== "zip") return new Response(null, { status: 404 });
  const period = invoicePeriod(Object.fromEntries(params));
  if (period.invalid) return new Response("Vérifie les dates de l’export.", { status: 400 });
  const cutoff = new Date().toISOString();
  const owner = access.user.id;
  const { data, error } = await exportInvoicePage(db, owner, period, cutoff);
  if (error) return new Response("Export temporairement indisponible.", { status: 500 });
  if (!data.length) return new Response("Aucune facture sur cette période.", { status: 404 });
  const name = period.from ? period.from + "_au_" + period.to : "toutes-les-dates";
  return new Response(streamInvoiceZip(exportPdfs(db, owner, period, cutoff, data)), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": 'attachment; filename="tesami-factures-' + name + '.zip"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
