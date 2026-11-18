"use client";

import { useState } from "react";
import Link from "next/link";
import { audiences, levels, normalize, findPerfumes } from "../../lib/parfums/expert.mjs";
import Fiche from "./Fiche";
import { recommend } from "./actions";
import styles from "./parfums.module.css";

const initialLimit = 24;
const formatDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

export default function Expert({ catalogue, history, historyUnavailable }) {
  const [view, setView] = useState("conseil");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(initialLimit);
  const [audience, setAudience] = useState("tous");
  const [worn, setWorn] = useState("");
  const [basis, setBasis] = useState(null);
  const [noteQuery, setNoteQuery] = useState("");
  const [notes, setNotes] = useState([]);
  const [results, setResults] = useState(null);
  const [past, setPast] = useState(history);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");

  const availableNotes = new Map(catalogue.flatMap(perfume => Object.keys(levels).flatMap(level => perfume[level]))
    .map(note => [normalize(note), note]));
  const noteChoices = [...availableNotes.values()].sort((a, b) => a.localeCompare(b, "fr"));
  const suggestions = normalize(worn) ? findPerfumes(catalogue.filter(perfume => perfume.inspiration), worn).slice(0, 8) : [];
  const visibleNotes = noteChoices.filter(note => normalize(note).includes(normalize(noteQuery)));
  const matches = findPerfumes(catalogue, query);

  function useBasis(perfume) {
    setBasis(perfume);
    setWorn(perfume.inspiration);
    setAudience(perfume.public_cible);
    const seen = new Map(Object.keys(levels).flatMap(level => perfume[level]).map(note => [normalize(note), note]));
    setNotes([...seen.keys()].slice(0, 12).map(key => availableNotes.get(key)));
    setResults(null);
  }

  function toggleNote(note) {
    setNotes(old => old.includes(note) ? old.filter(item => item !== note) : [...old, note]);
  }

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setResults(null);
    try {
      const result = await recommend(audience, notes, basis?.reference ?? null);
      setMessage(result.error || result.warning || "");
      if (!result.error) setResults(result.results);
      if (result.entry) setPast(old => [result.entry, ...old].slice(0, 30));
    } catch {
      setMessage("La recherche a échoué. Réessaie dans un instant.");
    } finally {
      setPending(false);
    }
  }

  return <>
    <nav className={styles.tabs} aria-label="Expert Parfums">
      {Object.entries({ conseil: "Trouver un parfum", catalogue: "Catalogue", historique: "Historique" }).map(([key, label]) =>
        <button key={key} type="button" aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
    </nav>
    {view === "catalogue" && <section>
      <label className={styles.field}>Rechercher par référence, nom ou famille
        <input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(initialLimit); }} placeholder="Ex. 055W, 55 ou ambré" />
      </label>
      <p>{matches.length} fiche(s)</p>
      <div className={styles.grid}>{matches.slice(0, limit).map(perfume => <Fiche key={perfume.reference} perfume={perfume} compact />)}</div>
      {matches.length > limit && <button type="button" onClick={() => setLimit(limit + initialLimit)}>Voir plus de parfums</button>}
    </section>}
    {view === "conseil" && <>
      <form className={styles.card} onSubmit={submit}>
        <fieldset disabled={pending}>
          <legend>Quel parfum portes-tu déjà ?</legend>
          <label className={styles.field}>Nom du parfum ou référence Olfazeta (facultatif)
            <input type="search" value={worn} onChange={event => { setWorn(event.target.value); setBasis(null); setNotes([]); setResults(null); }} placeholder="Ex. Sauvage ou 094M" />
          </label>
          {!basis && suggestions.length > 0 && <ul className={styles.suggestions}>{suggestions.map(perfume =>
            <li key={perfume.reference}><button type="button" onClick={() => useBasis(perfume)}>{perfume.inspiration} · {perfume.reference}</button></li>)}</ul>}
          {!basis && worn.trim() && suggestions.length === 0 && <p>Ce parfum ne figure pas dans les correspondances du catalogue. Retrouve la bonne version sur <a href="https://www.fragrantica.fr/" target="_blank" rel="noreferrer">Fragrantica</a>, puis sélectionne ci-dessous les notes que tu apprécies.</p>}
          {basis && <p>Les notes de la référence {basis.reference} ont été présélectionnées. Garde celles que tu apprécies le plus. <Link href={`/expert-parfums/${basis.reference}`}>Voir la fiche Olfazeta</Link></p>}
          <label className={styles.field}>Pour qui cherches-tu ?
            <select value={audience} onChange={event => setAudience(event.target.value)}>
              {Object.entries(audiences).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className={styles.field}>Quelles notes aimes-tu ?
            <input type="search" value={noteQuery} onChange={event => setNoteQuery(event.target.value)} placeholder="Ex. vanille ou bergamote" />
          </label>
          <p>{notes.length} / 12 notes sélectionnées</p>
          <div className={styles.notes} aria-label="Notes sélectionnées">
            {notes.map(note => <button key={note} type="button" aria-label={`Retirer ${note}`} aria-pressed="true" onClick={() => toggleNote(note)}>{note} ×</button>)}
          </div>
          <div className={styles.notes} aria-label="Notes disponibles">
            {visibleNotes.filter(note => !notes.includes(note)).slice(0, 24).map(note =>
              <button key={note} type="button" disabled={notes.length >= 12} onClick={() => toggleNote(note)}>{note}</button>)}
          </div>
          {visibleNotes.length === 0 && <p>Aucune note du catalogue ne correspond à cette recherche.</p>}
          <button className={styles.primary} disabled={!notes.length} type="submit">{pending ? "Recherche en cours…" : "Voir mes recommandations"}</button>
        </fieldset>
      </form>
      {message && <p role="alert">{message}</p>}
      {results && <section aria-live="polite">
        <h2>Tes recommandations</h2>
        <p>Le score est la part des notes choisies qui figurent dans la pyramide. Chaque note compte une fois.</p>
        {results.length ? <div className={styles.grid}>{results.map(result =>
          <Fiche key={result.perfume.reference} perfume={result.perfume} compact result={result} />)}</div> :
          <p>Aucune correspondance dans ce filtre. Essaie sans préférence de public ou modifie les notes sélectionnées.</p>}
      </section>}
    </>}
    {view === "historique" && <section>
      <h2>Mes recherches récentes</h2>
      {historyUnavailable && <p role="alert">L’historique est temporairement indisponible.</p>}
      {!past.length && !historyUnavailable && <p>Tes prochaines recherches apparaîtront ici.</p>}
      {past.map(entry => <article key={entry.id} className={styles.card}>
        <small>{formatDate.format(new Date(entry.created_at))} · {audiences[entry.public_cible]}</small>
        {entry.reference_depart && <p>Parfum de départ · {entry.reference_depart}</p>}
        <p>{entry.preferences.join(" · ")}</p>
        {entry.resultats.length ? <ul>{entry.resultats.map(({ reference, nom, score }) =>
          <li key={reference}>{catalogue.some(perfume => perfume.reference === reference) ?
            <Link href={`/expert-parfums/${reference}`}>{nom} ({reference})</Link> : `${nom} (${reference})`} · {score} %</li>)}</ul> :
          <p>Aucune correspondance</p>}
      </article>)}
    </section>}
  </>;
}
