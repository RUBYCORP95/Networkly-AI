"use client";

import { useEffect, useState } from "react";
import { formatSubscriptionPrice, subscriptionPlans } from "../../lib/subscription-prices";

export default function SubscriptionPrices() {
  const [catalog, setCatalog] = useState(null);
  const [changes, setChanges] = useState({});
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/admin/prices", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error);
    setCatalog(data);
  }

  useEffect(() => { load().catch(error => setMessage(error.message)); }, []);

  async function save() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/prices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...confirmation, confirmed: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const code = confirmation.code;
      setConfirmation(null);
      setChanges(current => ({ ...current, [code]: undefined }));
      await load();
      setMessage("Tarif enregistré.");
    } catch (error) {
      setMessage(error.message || "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="admincard">
    <h2>Tarifs TESAMI</h2>
    <p>Les nouveaux tarifs s’appliquent aux futures souscriptions. Pro est disponible à l’achat.</p>
    {message && <p className="notice" role="status">{message}</p>}
    {catalog && <>
      <div className="admin-metrics">
        {subscriptionPlans.map(plan => {
          const price = catalog.prices.find(row => row.code === plan.code);
          if (!price) return null;
          const draft = changes[plan.code] ?? (price.cents / 100).toFixed(2);
          const cents = Math.round(Number(draft) * 100);
          return <div key={plan.code}>
            <strong>{plan.name}</strong>
            <small>{formatSubscriptionPrice(price.cents)} / mois{!["free","pro"].includes(plan.code) && " · À venir"}</small>
            {plan.code !== "free" && <form onSubmit={event => {
              event.preventDefault();
              setConfirmation({ code: plan.code, name: plan.name, cents, previousCents: price.cents });
              setMessage("");
            }}>
              <label>Prix mensuel (€)<input type="number" min="0.01" max="9999.99" step="0.01" required value={draft}
                disabled={busy || !!confirmation} onChange={event => setChanges(current => ({ ...current, [plan.code]: event.target.value }))} /></label>
              <button className="admin-secondary-link" disabled={busy || !!confirmation || cents === price.cents}>Enregistrer</button>
            </form>}
          </div>;
        })}
      </div>
      {confirmation && <div className="notice" role="group" aria-label="Confirmation du tarif">
        <p>Confirmer le tarif {confirmation.name} de {formatSubscriptionPrice(confirmation.previousCents)} à {formatSubscriptionPrice(confirmation.cents)} par mois ?</p>
        <div className="admin-review-links">
          <button type="button" className="admin-primary-link" disabled={busy} onClick={save}>Confirmer</button>
          <button type="button" className="admin-secondary-link" disabled={busy} onClick={() => setConfirmation(null)}>Annuler</button>
        </div>
      </div>}
      <h3>Historique des tarifs</h3>
      {catalog.history.length === 0 ? <p>Aucun changement enregistré.</p> : <ul>
        {catalog.history.map(row => <li key={row.id}>{new Date(row.changed_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} · {subscriptionPlans.find(plan => plan.code === row.code)?.name} · {formatSubscriptionPrice(row.previous_cents)} → {formatSubscriptionPrice(row.new_cents)}</li>)}
      </ul>}
    </>}
  </section>;
}
