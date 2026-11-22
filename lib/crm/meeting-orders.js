const batchSize = 250;

export async function readMeetingOrders(db, sessionId, { owner, includeCancelled = false } = {}) {
  const orders = [];
  let lastId = null;
  while (true) {
    let query = db.from("crm_orders")
      .select("id,client_id,buyer,items,order_date,total_cents,shipping_cents,status,payment_status,meeting_reviewed_at,delivery_address")
      .eq("host_session_id", sessionId).order("id").limit(batchSize);
    if (owner) query = query.eq("owner_id", owner);
    if (!includeCancelled) query = query.neq("status", "cancelled");
    if (lastId) query = query.gt("id", lastId);
    const { data, error } = await query;
    if (error) return { data: [], error };
    orders.push(...data);
    if (data.length < batchSize) return { data: orders, error: null };
    lastId = data.at(-1).id;
  }
}
