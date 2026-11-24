"use client";

import { useEffect, useState } from "react";
import { choganPlanUrl, choganPointValueCents, choganTiers } from "../../../lib/recruitment/chogan.mjs";
import { ExpenseFields, fetchRecruitment, NumberField } from "../../recrutement/Fields";
import styles from "../../recrutement/recruitment.module.css";

const endpoint = "/api/admin/recrutement";
const tierFields = [
  ["points", "Points cumulés", 100000000, 1],
  ["personalPoints", "Points personnels", 1000000, 1],
  ["consultants", "Consultants minimum", 1000, 1],
  ["bps", "Taux (%)", 10000, 100],
  ["branchCap", "Plafond de points par branche", 100000000, 1, true],
  ["personalCap", "Plafond de points personnels", 1000000, 1, true],
  ["commissionMinConsultants", "Branches requises pour le différentiel", 1000, 1, true],
];

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetchRecruitment(endpoint, { signal: controller.signal }).then(data => {
      setSettings(data.settings); setAccounts(data.accounts);
    }).catch(issue => { if (issue.name !== "AbortError") setError(issue.message); });
    return () => controller.abort();
  }, []);

  function set(field, value) { setSettings(current => ({ ...current, [field]: value })); }
  function tier(index, field, value) {
    set("tiers", settings.tiers.map((item, i) => i === index ? { ...item, [field]: value } : item));
  }

  async function run(action) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); }
    catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  }

  const patch = input => fetchRecruitment(endpoint, { method: "PATCH",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
  return <>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.notice} role="status">{message}</p>}
    {!settings && !error && <p role="status">Chargement des paramètres…</p>}
    {settings && <>
      <form className={styles.panel} onSubmit={event => {
        event.preventDefault();
        run(async () => {
          const data = await patch({ type: "settings", settings });
          setSettings(data.settings); setMessage("Configuration enregistrée.");
        });
      }}>
        <fieldset disabled={busy}>
          <h2>Paramètres des simulations</h2>
          <label className={styles.check}><input type="checkbox" checked={settings.enabled} onChange={event => set("enabled", event.target.checked)} />Activer le module et ses liens publics</label>
          <label className={styles.check}><input type="checkbox" checked={settings.default_access} onChange={event => set("default_access", event.target.checked)} />Donner accès par défaut aux consultants validés</label>
          <div className={styles.fields}>
            <NumberField label="Marge par parfum (€)" value={settings.margin_cents} max={100000} scale={100} onChange={value => set("margin_cents", value)} />
            <NumberField label="Points par parfum" value={settings.points} max={1000} onChange={value => set("points", value)} />
            <NumberField label="Valeur d’un point (€)" value={settings.point_value_cents} max={100000} scale={100} optional onChange={value => set("point_value_cents", value)} />
          </div>
          <label>Présentation Chogan<textarea required rows="5" maxLength={3000} value={settings.presentation} onChange={event => set("presentation", event.target.value)} /></label>
          <label>URL HTTPS de la vidéo par défaut<input type="url" maxLength={1000} value={settings.video_url} onChange={event => set("video_url", event.target.value)} /></label>
          <h3>Paliers de commission</h3>
          <p>Renseigne les seuils, les conditions et les taux vérifiés pour le plan applicable. La commission en euros s’affiche quand la valeur d’un point est renseignée.</p>
          {settings.tiers.length === 0 && <div className={styles.actions}>
            <button type="button" className={styles.secondary} onClick={() => setSettings(current => ({
              ...current, tiers: choganTiers, differential: true,
              point_value_cents: current.point_value_cents ?? choganPointValueCents,
            }))}>Charger les paliers Chogan</button>
            <a href={choganPlanUrl} target="_blank" rel="noreferrer">Plan de carrière Chogan (PDF)</a>
          </div>}
          <label className={styles.check}><input type="checkbox" checked={settings.differential} onChange={event => set("differential", event.target.checked)} />Appliquer le différentiel sur les ventes de l’équipe</label>
          {settings.tiers.map((item, index) => <div className={styles.line} key={index}>
            <label>Libellé du palier {index + 1}<input required maxLength={80} value={item.label} onChange={event => tier(index, "label", event.target.value)} /></label>
            {tierFields.map(([field, label, max, scale, optional]) => <NumberField key={field} label={label} max={max} scale={scale} optional={optional} value={item[field] ?? null}
              onChange={value => tier(index, field, value)} />)}
            <label className={styles.check}><input type="checkbox" checked={item.solo === true}
              onChange={event => tier(index, "solo", event.target.checked)} />Accessible avec les points personnels seuls</label>
            <button type="button" className={styles.secondary} aria-label={`Retirer le palier ${index + 1}`}
              onClick={() => set("tiers", settings.tiers.filter((_, i) => i !== index))}>Retirer</button>
          </div>)}
          <button type="button" className={styles.secondary} disabled={settings.tiers.length >= 30}
            onClick={() => set("tiers", [...settings.tiers, { label: "", points: 0, personalPoints: 0, consultants: 0, bps: 0 }])}>Ajouter un palier</button>
          <h3>Dépenses par défaut</h3>
          <ExpenseFields expenses={settings.expenses} onChange={value => set("expenses", value)} />
          <p><button type="submit">Enregistrer la configuration</button></p>
        </fieldset>
      </form>
      <section className={styles.panel}>
        <h2>Droits d’accès</h2>
        <p>Les exceptions concernent les comptes consultants validés.</p>
        <form className={styles.line} onSubmit={event => {
          event.preventDefault();
          run(async () => {
            const data = await fetchRecruitment(`${endpoint}?${new URLSearchParams({ q })}`);
            setAccounts(data.accounts);
          });
        }}>
          <label>Nom ou identifiant du compte<input value={q} maxLength={100} onChange={event => setQ(event.target.value)} /></label>
          <button type="submit" disabled={busy}>Rechercher</button>
        </form>
        {!accounts.length && <p>Aucun compte trouvé.</p>}
        {accounts.map(account => <div className={styles.record} key={account.id}>
          <strong>{account.full_name || account.id}</strong>
          {account.is_admin ? <p>Administrateur</p> : <label>Accès individuel
            <select aria-label={`Accès de ${account.full_name || account.id}`} disabled={busy} value={String(account.allowed)} onChange={event => {
              const allowed = JSON.parse(event.target.value);
              run(async () => {
                await patch({ type: "access", userId: account.id, allowed });
                setAccounts(current => current.map(item => item.id === account.id ? { ...item, allowed } : item));
                setMessage("Droit mis à jour.");
              });
            }}>
              <option value="null">Règle par défaut</option><option value="true">Autorisé</option><option value="false">Bloqué</option>
            </select>
          </label>}
        </div>)}
      </section>
    </>}
  </>;
}
