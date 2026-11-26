"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { audiences, levels, normalize, findPerfumes, olfazetaLabel } from "../../lib/parfums/expert.mjs";
import Fiche from "./Fiche";
import { recommend, searchExternalPerfumes } from "./actions";
import styles from "./parfums.module.css";

const initialLimit = 24;
const formatDate = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Paris" });

export default function Expert({ catalogue, history, historyUnavailable, signedIn = false }) {
  const [view, setView] = useState("conseil");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(initialLimit);
  const [audience, setAudience] = useState("tous");
  const [worn, setWorn] = useState("");
  const [basis, setBasis] = useState(null);
  const [external, setExternal] = useState(null);
  const [externalSearch, setExternalSearch] = useState(null);

  useEffect(() => {
    const query = worn.trim();
    if (basis || external || query.length < 2 || /^(?:n[°ºo]\s*)?\d+[mwu]?$/i.test(query)) return;
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const response = await searchExternalPerfumes(query);
        if (active) setExternalSearch({ query, ...response });
      } catch {
        if (active) setExternalSearch({ query, perfumes: [], unavailable: true });
      }
    }, 350);
    return () => { active = false; clearTimeout(timer); };
  }, [worn, basis, external]);
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
  const externalQuery = worn.trim();
  const externalResult = externalSearch?.query === externalQuery ? externalSearch : null;
  const canSearchExternal = externalQuery.length >= 2 && !/^(?:n[°ºo]\s*)?\d+[mwu]?$/i.test(externalQuery);

  function useExternal(perfume) {
    setExternal(perfume);
    setBasis(null);
    setWorn([perfume.name, perfume.house].join(" · "));
    setNotes(perfume.notes.slice(0, 12));
    setResults(null);
  }

  function useBasis(perfume) {
    setBasis(perfume);
    setExternal(null);
    setWorn(olfazetaLabel(perfume));
    setAudience(perfume.public_cible);
    const seen = new Map(Object.keys(levels).flatMap(level => perfume[level]).map(note => [normalize(note), note]));
    setNotes([...seen.keys()].slice(0, 12).map(key => availableNotes.get(key)));
    setResults(null);
  }

  function toggleNote(note) {
    setNotes(old => {
      const key = normalize(note);
      if (old.some(item => normalize(item) === key)) return old.filter(item => normalize(item) !== key);
      return old.length >= 12 ? old : [...old, note];
    });
  }

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setResults(null);
    try {
      const result = await recommend(audience, notes, basis?.reference ?? null, external?.id ?? null);
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
      {Object.entries({ conseil: "Trouver un parfum", catalogue: "Catalogue", ...(signedIn ? { historique: "Historique" } : {}) }).map(([key, label]) =>
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
            <input type="search" value={worn} onChange={event => { setWorn(event.target.value); setBasis(null); setExternal(null); setExternalSearch(null); setNotes([]); setResults(null); }} placeholder="Ex. Sauvage" />
          </label>
          {!basis && !external && canSearchExternal && <div aria-live="polite">
            {!externalResult && <p>Recherche dans le catalogue multimarque…</p>}
            {externalResult?.unavailable && <p>Le catalogue multimarque est temporairement indisponible.</p>}
            {externalResult?.perfumes.length > 0 && <ul className={styles.suggestions}>{externalResult.perfumes.map(perfume =>
              <li key={perfume.id}><button type="button" onClick={() => useExternal(perfume)}>
                {[perfume.name, perfume.house, perfume.concentration, perfume.year].filter(Boolean).join(" · ")}
              </button></li>)}</ul>}
            {externalResult && !externalResult.unavailable && !externalResult.perfumes.length && !suggestions.length &&
              <p>Aucun parfum trouvé. Essaie le nom seul, ou choisis directement les notes que tu aimes.</p>}
          </div>}
          {!basis && !external && suggestions.length > 0 && <ul className={styles.suggestions}>{suggestions.map(perfume =>
            <li key={perfume.reference}><button type="button" onClick={() => useBasis(perfume)}>{olfazetaLabel(perfume)}</button></li>)}</ul>}
          {basis && <p>Les notes de la référence {basis.reference} ont été présélectionnées. Garde celles que tu apprécies le plus. <Link href={`/expert-parfums/${basis.reference}`}>Voir la fiche Olfazeta</Link></p>}
          {external && <div className={styles.match}>
            <strong>{[external.name, external.house, external.concentration, external.year].filter(Boolean).join(" · ")}</strong>
            <dl className={styles.pyramid}>{Object.entries(levels).map(([stage, label]) =>
              <div key={stage}><dt>{label}</dt><dd>{external[stage].join(" · ") || "Non documenté"}</dd></div>)}</dl>
            <p>Sélectionne jusqu’à 12 notes du parfum pour les comparer au catalogue Olfazeta.</p>
            <div className={styles.notes} aria-label="Notes du parfum de départ">
              {external.notes.map(note => <button type="button" key={note} aria-pressed={notes.some(item => normalize(item) === normalize(note))}
                disabled={notes.length >= 12 && !notes.some(item => normalize(item) === normalize(note))} onClick={() => toggleNote(note)}>{note}</button>)}
            </div>
            <p><a href={external.url} target="_blank" rel="noreferrer">Données Scento</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · Certaines notes sont traduites en français.</p>
          </div>}
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
      {!signedIn && <p>Accès gratuit sans inscription. <Link href="/login">Connecte-toi à TESAMI</Link> pour conserver ton historique.</p>}
      {results && <section aria-live="polite">
        <h2>Tes recommandations</h2>
        <p>Le score est la part des notes choisies qui figurent dans la pyramide. Chaque note compte une fois.</p>
        {results.length ? <div className={styles.grid}>{results.map(result =>
          <Fiche key={result.perfume.reference} perfume={result.perfume} compact result={result} />)}</div> :
          <p>Aucune correspondance dans ce filtre. Essaie sans préférence de public ou modifie les notes sélectionnées.</p>}
      </section>}
    </>}
    {signedIn && view === "historique" && <section>
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
