"use client";

import { useEffect, useRef, useState } from "react";
import { allocateBudget, legal, money, sales, teamEstimate } from "../../../lib/recruitment/model.mjs";
import styles from "../recruitment.module.css";

function Metric({ label, children }) {
  return <div className={styles.metric}><span>{label}</span><strong>{children}</strong></div>;
}

function Quantity({ label, value, onChange, max = 100 }) {
  return <label className={styles.quantity}>
    <span>{label} <strong>{value}</strong></span>
    <input type="range" min="0" max={max} value={value} onChange={event => onChange(Number(event.target.value))} />
    <small><span>0</span><span>{max / 2}</span><span>{max}</span></small>
  </label>;
}

const rate = bps => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(bps / 100) + " %";

export default function Simulator({ simulation, slug }) {
  const [quantity, setQuantity] = useState(simulation.quantity);
  const [teamSize, setTeamSize] = useState(simulation.team_size);
  const [perMember, setPerMember] = useState(simulation.per_member);
  const [personalSales, setPersonalSales] = useState(simulation.personal_sales);
  const [expenses, setExpenses] = useState(simulation.expenses);
  const sent = useRef(null);
  const eventUrl = kind => `/api/recrutement/${slug}/evenement?type=${kind}`;
  useEffect(() => {
    if (sent.current === slug) return;
    sent.current = slug;
    fetch(`/api/recrutement/${slug}/evenement?type=visit`, { method: "POST", keepalive: true }).catch(() => {});
  }, [slug]);
  const { settings } = simulation;
  const individual = sales(quantity, settings);
  const budget = allocateBudget(individual.monthly, expenses);
  const team = teamEstimate(personalSales, teamSize, perMember, settings);

  return <main className={styles.publicPage}>
    <header className={styles.hero}>
      <img src="/tesami-logo.svg" alt="TESAMI" width="92" height="66" />
      <p>Bonjour {simulation.first_name}</p>
      <h1>Et si tu changeais ton quotidien ?</h1>
      <div className={styles.sponsor}>
        {simulation.photo_url && <img src={simulation.photo_url} width="56" height="56" alt="" referrerPolicy="no-referrer" />}
        <span>Une invitation de <strong>{simulation.consultant_name}</strong></span>
      </div>
    </header>
    <section className={styles.panel}>
      <h2>Découvrir Chogan</h2>
      <p className={styles.presentation}>{settings.presentation}</p>
      {simulation.video_url && <a className={styles.secondary} href={simulation.video_url} target="_blank" rel="noreferrer">Voir la vidéo de présentation</a>}
    </section>
    <section className={styles.panel}>
      <h2>Simule tes ventes de parfums</h2>
      <div className={styles.metrics} aria-live="polite">
        <Metric label="Complément mensuel">{money(individual.monthly)}</Metric>
        <Metric label="Complément annuel">{money(individual.yearly)}</Metric>
      </div>
      <Quantity label="Parfums vendus par mois" value={quantity} onChange={setQuantity} />
      <div className={styles.metrics}>
        <Metric label="Marge indicative par parfum">{money(settings.margin_cents)}</Metric>
        <Metric label="Points générés mensuellement">{individual.points} points</Metric>
      </div>
      <p className={styles.muted}>Simulation indicative avant charges et impôts. Revenus non garantis.</p>
    </section>
    <section className={styles.panel}>
      <h2>Simulation du budget mensuel</h2>
      <p className={styles.highlight}>{money(individual.monthly)} disponibles</p>
      {!budget.rows.length && <p>Aucune dépense proposée pour cette simulation.</p>}
      {budget.rows.map((expense, index) => <div className={styles.budgetRow} key={index}>
        <label>{expense.label}
          <input type="number" min="0" max="100000" step="0.01" inputMode="decimal" defaultValue={expense.cents / 100}
            onChange={event => {
              const cents = Math.max(0, Math.min(10000000, Math.round(Number(event.target.value) * 100)));
              if (Number.isFinite(cents)) setExpenses(current => current.map((row, i) => i === index ? { ...row, cents } : row));
            }}
          />
        </label>
        <div><strong>{money(expense.funded)} financés</strong><span>{expense.funded === expense.cents ? "Couvert" : "Partiellement ou non couvert"}</span></div>
      </div>)}
      <Metric label="Budget restant">{money(budget.remaining)}</Metric>
    </section>
    <section className={styles.panel}>
      <h2>Simule le développement de ton équipe</h2>
      <div className={styles.fields}>
        <label>Nombre de consultants dans l’équipe
          <input type="number" min="0" max="1000" value={teamSize}
            onChange={event => setTeamSize(Math.trunc(Math.max(0, Math.min(1000, Number(event.target.value)))))} />
        </label>
        <Quantity label="Parfums vendus par consultant" value={perMember} onChange={setPerMember} />
        <Quantity label="Ventes personnelles" value={personalSales} onChange={setPersonalSales} />
      </div>
      <div className={styles.metrics} aria-live="polite">
        <Metric label="Points personnels">{team.personal.points}</Metric>
        <Metric label="Points de l’équipe">{team.teamPoints}</Metric>
        <Metric label="Points cumulés">{team.total}</Metric>
        <Metric label="Marge sur ventes personnelles">{money(team.personal.monthly)}</Metric>
        {team.commission !== null && <Metric label="Commission mensuelle indicative">{money(team.commission)}</Metric>}
      </div>
      {settings.tiers.length > 0 ? <>
        <p>{team.tier ? `Palier atteint · ${team.tier.label} (${rate(team.tier.bps)})` : "Aucun palier atteint."}</p>
        {settings.differential && <p>Taux estimé par consultant · {rate(team.memberRate)}. L’équipe est modélisée sur un seul niveau.</p>}
        {team.next && <p>Prochain palier · {team.next.label} ({rate(team.next.bps)}). Il manque {team.missingPoints} points cumulés, {team.missingPersonal} points personnels et {team.missingConsultants} consultants.</p>}
        {team.commission === null && <p>Valeur du point en euros à renseigner pour estimer une commission.</p>}
        <details><summary>Voir les conditions du barème</summary>
          <ul>{settings.tiers.map(tier => <li key={tier.points}>{tier.label} ({rate(tier.bps)}) · {tier.points} points cumulés, {tier.personalPoints} points personnels et {tier.consultants} consultants.</li>)}</ul>
        </details>
      </> : <p>Le barème de commission n’est pas encore renseigné.</p>}
    </section>
    {(simulation.whatsapp || simulation.join) && <section className={styles.panel}>
      <h2>Envie d’en savoir plus ?</h2>
      <div className={styles.actions}>
        {simulation.whatsapp && <form method="post" action={eventUrl("whatsapp")}><button type="submit">Contacter sur WhatsApp</button></form>}
        {simulation.join && <form method="post" action={eventUrl("join")}><button type="submit">S’inscrire avec mon parrain</button></form>}
      </div>
    </section>}
    <footer className={styles.legal}>{legal}</footer>
  </main>;
}
