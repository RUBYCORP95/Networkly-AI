import { receiptNumber, receiptText } from "./order-receipt.mjs";

export async function sendPendingOrderEmails(db) {
  const key = process.env.BREVO_TRANSACTIONAL_API_KEY;
  if (!key) return 0;
  await db.from("crm_orders").update({ email_state: "failed" })
    .eq("email_state", "sending").eq("email_attempts", 3).lte("email_next_at", new Date().toISOString());
  const { data, error } = await db.rpc("claim_crm_order_emails");
  if (error) throw new Error("File d’envoi CRM indisponible");
  const results = await Promise.all((data ?? []).map(async order => {
    let accepted = false;
    let retry = false;
    try {
      const response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": key, "content-type": "application/json" },
        signal: AbortSignal.timeout(8000),
        body: JSON.stringify({
          sender: { name: "TESAMI", email: "no-reply@tesami.fr" },
          to: [{ email: order.buyer.email }],
          replyTo: order.seller.email ? { email: order.seller.email, name: order.seller.name } : undefined,
          subject: "Votre bon de commande " + receiptNumber(order.id),
          textContent: receiptText(order),
          headers: { idempotencyKey: order.id },
        }),
      });
      accepted = response.ok;
      if (response.status === 409 || response.status === 400) {
        const payload = await response.json().catch(() => ({}));
        accepted = payload.code === "duplicate_parameter" && /idempotency key/i.test(payload.message ?? "");
      }
      retry = response.status === 429 || response.status >= 500;
    } catch {
      retry = true;
    }
    const { error: updateError } = await db.from("crm_orders").update({
      email_state: accepted ? "sent" : retry && order.email_attempts < 3 ? "queued" : "failed",
      email_next_at: accepted ? null : new Date(Date.now() + 60000).toISOString(),
      email_sent_at: accepted ? new Date().toISOString() : null,
    }).eq("id", order.id).eq("email_attempts", order.email_attempts);
    if (updateError) throw new Error("Statut e-mail CRM indisponible");
    return accepted;
  }));
  return results.filter(Boolean).length;
}
