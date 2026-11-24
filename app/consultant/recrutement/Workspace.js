"use client";

import { useEffect, useRef, useState } from "react";
import { statuses } from "../../../lib/recruitment/model.mjs";
import { ExpenseFields, fetchRecruitment, NumberField } from "../../recrutement/Fields";
import styles from "../../recrutement/recruitment.module.css";

const endpoint = "/api/consultant/recrutement";
const indicators = {
  created: "Pages créées", visits: "Visites", whatsapp: "Clics WhatsApp", joined: "Clics inscription",
  follow_up: "À relancer", registered: "Inscrits", archived: "Archivés",
};
const identity = [
  ["first_name", "Prénom du prospect", 60, "text", true],
  ["consultant_name", "Ton nom affiché", 100, "text", true],
  ["photo_url", "URL HTTPS de ta photo publique", 1000, "url", false],
  ["video_url", "URL HTTPS de la vidéo (facultatif)", 1000, "url", false],
  ["join_url", "Lien HTTPS de parrainage", 1000, "url", false],
  ["whatsapp", "Numéro WhatsApp professionnel (format international)", 30, "tel", false],
];
const volumes = [
  ["quantity", "Parfums vendus par mois", 100],
  ["team_size", "Consultants dans l’équipe", 1000],
  ["per_member", "Parfums par consultant", 100],
  ["personal_sales", "Ventes personnelles pour l’équipe", 100],
];

function Record({ row, select, setMessage }) {
  const href = `/recrutement/${row.slug}`;
  const share = typeof window === "undefined" ? "" : new URL(href, window.location.origin).href;
  const message = encodeURIComponent(`Bonjour ${row.first_name}, voici ta simulation TESAMI : ${share}`);
  return <article className={styles.record}>
    <h3>{row.first_name} · {statuses[row.status]}</h3>
    <p>{row.visits} visite(s) · {row.whatsapp_clicks} clic(s) WhatsApp · {row.join_clicks} clic(s) inscription</p>
    <p className={styles.muted}>Créée le {new Date(row.created_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })} · Modifiée le {new Date(row.updated_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}</p>
    <div className={styles.actions}>
      <button type="button" onClick={() => select(row)}>Modifier</button>
      {row.status !== "archived" && <>
        <a className={styles.secondary} href={href} target="_blank" rel="noreferrer">Ouvrir la page</a>
        <button type="button" className={styles.secondary} onClick={async () => {
          try { await navigator.clipboard.writeText(share); setMessage("Lien copié."); }
          catch { setMessage(share); }
        }}>Copier le lien</button>
        <a className={styles.secondary} href={`https://wa.me/?text=${message}`} target="_blank" rel="noreferrer">WhatsApp</a>
        <a className={styles.secondary} href={`sms:?body=${message}`}>SMS</a>
        <a className={styles.secondary} href={`mailto:?subject=Ta%20simulation%20TESAMI&body=${message}`}>E-mail</a>
      </>}
    </div>
  </article>;
}

export default function Workspace() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState({ q: "", status: "", page: 0 });
  const [search, setSearch] = useState("");
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const editor = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchRecruitment(`${endpoint}?${new URLSearchParams(filter)}`, { signal: controller.signal })
      .then(setData).catch(issue => { if (issue.name !== "AbortError") setError(issue.message); });
    return () => controller.abort();
  }, [filter, refresh]);

  function edit(row) {
    setForm(row ?? { ...data.defaults, first_name: "", photo_url: "", whatsapp: "", video_url: "", notes: "",
      status: "active", quantity: 30, team_size: 5, per_member: 10, personal_sales: 10 });
    requestAnimationFrame(() => editor.current?.scrollIntoView({ block: "start" }));
  }

  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const editing = Boolean(form.id);
      await fetchRecruitment(endpoint, { method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      setMessage(editing ? "Simulation mise à jour. Le lien est identique." : "Simulation créée. Le lien est prêt à partager.");
      setForm(null);
      setFilter({ q: "", status: "", page: 0 });
      setSearch("");
    } catch (issue) { setError(issue.message); }
    finally { setSaving(false); }
  }

  const set = (field, value) => setForm(current => ({ ...current, [field]: value }));
  return <>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {message && <p className={styles.notice} role="status">{message}</p>}
    {!data && !error && <p role="status">Chargement des simulations…</p>}
    {data && <>
      <div className={styles.metrics}>{Object.entries(indicators).map(([key, label]) =>
        <div className={styles.metric} key={key}><span>{label}</span><strong>{data.metrics[key]}</strong></div>)}</div>
      <div className={styles.actions}>
        <button type="button" onClick={() => edit(null)}>Créer une simulation</button>
        <button type="button" className={styles.secondary} onClick={() => { setError(""); setRefresh(n => n + 1); }}>Actualiser les statistiques</button>
      </div>
      {form && <section className={styles.panel} ref={editor}>
        <h2>{form.id ? "Modifier la simulation" : "Nouvelle simulation"}</h2>
        <form onSubmit={save}>
          <fieldset disabled={saving}>
            <div className={styles.fields}>
              {identity.map(([field, label, max, type, required]) => <label key={field}>{label}
                <input required={required} type={type} maxLength={max} value={form[field]} onChange={event => set(field, event.target.value)} />
              </label>)}
              {volumes.map(([field, label, max]) => <NumberField key={field} label={label} max={max} value={form[field]} onChange={value => set(field, value)} />)}
            </div>
            <p className={styles.muted}>Le prénom, ton nom et la photo renseignée sont visibles par toute personne disposant du lien. Le numéro WhatsApp sert au contact.</p>
            <h3>Dépenses proposées</h3>
            <ExpenseFields expenses={form.expenses} onChange={value => set("expenses", value)} />
            <div className={styles.fields}>
              <label>Statut<select aria-label="Statut de la simulation" value={form.status} onChange={event => set("status", event.target.value)}>
                {Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
              </select></label>
              <label>Notes privées<textarea rows="4" maxLength={5000} value={form.notes} onChange={event => set("notes", event.target.value)} /></label>
            </div>
            {form.status === "archived" && <p>La page publique est indisponible tant que la simulation est archivée.</p>}
            <div className={styles.actions}>
              <button type="submit">{saving ? "Enregistrement…" : "Enregistrer"}</button>
              <button type="button" className={styles.secondary} onClick={() => setForm(null)}>Annuler</button>
            </div>
          </fieldset>
        </form>
      </section>}
      <section className={styles.panel}>
        <h2>Historique des simulations</h2>
        <form className={styles.line} onSubmit={event => { event.preventDefault(); setFilter(current => ({ ...current, q: search, page: 0 })); }}>
          <label>Prénom<input value={search} maxLength={60} onChange={event => setSearch(event.target.value)} /></label>
          <label>Statut<select aria-label="Filtrer par statut" value={filter.status} onChange={event => setFilter(current => ({ ...current, status: event.target.value, page: 0 }))}>
            <option value="">Tous les statuts</option>
            {Object.entries(statuses).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </select></label>
          <button type="submit">Rechercher</button>
        </form>
        {data.simulations.map(row => <Record key={row.id} row={row} select={edit} setMessage={setMessage} />)}
        {!data.simulations.length && <p>Aucune simulation trouvée.</p>}
        {data.total > data.pageSize && <div className={styles.actions}>
          <button type="button" disabled={!filter.page} onClick={() => setFilter(current => ({ ...current, page: current.page - 1 }))}>Précédente</button>
          <span>Page {filter.page + 1} sur {Math.ceil(data.total / data.pageSize)}</span>
          <button type="button" disabled={(filter.page + 1) * data.pageSize >= data.total}
            onClick={() => setFilter(current => ({ ...current, page: current.page + 1 }))}>Suivante</button>
        </div>}
      </section>
    </>}
  </>;
}
