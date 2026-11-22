import { loadHostRewards } from "./host-rewards.mjs";
import { makeOrderPdf } from "./order-pdf.mjs";
import { orderFields, receiptEmailHtml, receiptEmailText, receiptNumber } from "./order-receipt.mjs";

async function sendCustomerBon(db, job, key) {
  const { data: order, error } = await db.from("crm_orders")
    .select(orderFields + ",delivery_address,crm_host_sessions(delivery_mode,status)")
    .eq("id", job.order_id).eq("owner_id", job.owner_id).eq("host_session_id", job.session_id).maybeSingle();
  if (error) throw error;
  if (!order || order.status === "cancelled") return { state: "failed" };
  if (order.crm_host_sessions?.status !== "closed") return { state: "queued" };

  const [profile, host] = await Promise.all([
    order.payment_status === "paid" ? Promise.resolve({ data: null }) :
      db.from("crm_seller_profiles").select("payment_links").eq("owner_id", job.owner_id).maybeSingle(),
    loadHostRewards(db, job.owner_id, job.session_id),
  ]);
  if (profile.error || host.error) throw new Error("Données du bon individuel indisponibles");

  const mode = order.meeting_delivery_mode ?? order.crm_host_sessions?.delivery_mode;
  const address = mode === "individual" ? order.delivery_address : null;
  const pdfOrder = address ? { ...order, buyer: { ...order.buyer, address } } : order;
  const pdf = await makeOrderPdf(pdfOrder, host.rewards);
  const paymentLinks = profile.data?.payment_links ?? [];
  const reference = receiptNumber(order);
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json" },
    signal: AbortSignal.timeout(8000),
    body: JSON.stringify({
      sender: { name: "TESAMI", email: "no-reply@tesami.fr" },
      to: [{ email: job.recipient }],
      replyTo: order.seller?.email ? { email: order.seller.email, name: order.seller.name } : undefined,
      subject: "Votre bon de commande " + reference,
      textContent: receiptEmailText(order, paymentLinks),
      htmlContent: receiptEmailHtml(order, paymentLinks),
      attachment: [{ name: reference + ".pdf", content: Buffer.from(pdf).toString("base64") }],
      headers: { idempotencyKey: "meeting-final-" + job.order_id },
    }),
  });
  if (response.ok) return { state: "sent" };

  const rejection = await response.json().catch(() => ({}));
  if (rejection.code === "duplicate_parameter" && /idempotency key/i.test(rejection.message ?? "")) return { state: "sent" };
  if (response.status === 429 || response.status >= 500) return { state: "queued" };
  console.warn("Brevo meeting email rejected", { status: response.status });
  return { state: "failed" };
}

export async function sendPendingMeetingOrders(db) {
  const key = process.env.BREVO_TRANSACTIONAL_API_KEY;
  if (!key) return { sent: 0, configured: false };

  const expired = await db.from("crm_meeting_order_emails").update({ state: "failed" })
    .eq("state", "sending").eq("attempts", 3).lte("next_at", new Date().toISOString());
  if (expired.error) throw new Error("File des bons de réunion indisponible");
  const { data, error } = await db.rpc("claim_meeting_customer_bons");
  if (error) throw new Error("File des bons de réunion indisponible");

  const results = await Promise.all((data ?? []).map(async job => {
    const { state } = await sendCustomerBon(db, job, key).catch(() => ({ state: "queued" }));
    const nextState = state === "queued" && job.attempts >= 3 ? "failed" : state;
    const { error: writeError } = await db.from("crm_meeting_order_emails").update({
      state: nextState,
      next_at: nextState === "queued" ? new Date(Date.now() + 60000).toISOString() : null,
      sent_at: nextState === "sent" ? new Date().toISOString() : null,
    }).eq("order_id", job.order_id).eq("attempts", job.attempts).eq("state", "sending");
    if (writeError) throw new Error("Statut d’envoi du bon indisponible");
    return nextState === "sent";
  }));
  return { sent: results.filter(Boolean).length, configured: true };
}
