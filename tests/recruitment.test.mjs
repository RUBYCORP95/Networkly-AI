import assert from "node:assert/strict";
import test from "node:test";
import { allocateBudget, httpsUrl, referralInput, sales, teamEstimate, validateSimulation, validateSettings } from "../lib/recruitment/model.mjs";

const tiers = [
  { label: "Premier", points: 140, personalPoints: 0, consultants: 0, bps: 500 },
  { label: "Deuxième", points: 800, personalPoints: 140, consultants: 5, bps: 1000 },
  { label: "Troisième", points: 1000, personalPoints: 280, consultants: 6, bps: 1500 },
];
const settings = { margin_cents: 1750, points: 14, point_value_cents: 100, differential: true, tiers };

test("calcule les marges et points mensuels et annuels, y compris zéro vente", () => {
  assert.deepEqual(sales(30, settings), { monthly: 52500, yearly: 630000, points: 420 });
  assert.deepEqual(sales(0, settings), { monthly: 0, yearly: 0, points: 0 });
});

test("affecte chaque centime à une seule dépense, dans l’ordre", () => {
  const expenses = [5000, 7500, 10000, 25000, 10000].map(cents => ({ cents }));
  const budget = allocateBudget(52500, expenses);
  assert.deepEqual(budget.rows.map(item => item.funded), [5000, 7500, 10000, 25000, 5000]);
  assert.equal(budget.remaining, 0);
  assert.equal(allocateBudget(60000, expenses).remaining, 2500);
  assert.equal(allocateBudget(0, expenses).rows.every(item => item.funded === 0), true);
});

test("qualifie les paliers et applique le différentiel sur les points de l’équipe", () => {
  const result = teamEstimate(10, 5, 10, settings);
  assert.equal(result.personal.points, 140);
  assert.equal(result.teamPoints, 700);
  assert.equal(result.total, 840);
  assert.equal(result.personal.monthly, 17500);
  assert.equal(result.tier.label, "Deuxième");
  assert.equal(result.memberRate, 500);
  assert.equal(result.commission, 4900);
  assert.deepEqual([result.missingPoints, result.missingPersonal, result.missingConsultants], [160, 140, 1]);
  assert.equal(teamEstimate(10, 5, 10, { ...settings, differential: false }).commission, 8400);
  assert.equal(teamEstimate(5, 6, 10, settings).tier.label, "Premier");
  assert.equal(teamEstimate(10, 5, 10, { ...settings, point_value_cents: null }).commission, null);
  assert.equal(teamEstimate(10, 5, 10, { ...settings, tiers: [] }).commission, null);
});

test("valide les réglages et élimine les attributs réservés au serveur", () => {
  const values = validateSettings({ ...settings, enabled: true, default_access: true, expenses: [],
    tiers: [...tiers].reverse(), presentation: "Présentation", video_url: "" });
  assert.deepEqual(values.tiers, tiers);
  assert.throws(() => validateSettings({ ...values, tiers: [tiers[0], tiers[0]] }), /seuils distincts/);
  assert.throws(() => httpsUrl("javascript:alert(1)"), /HTTPS/);
  assert.throws(() => httpsUrl("https://secret@example.com"), /HTTPS/);
  const row = validateSimulation({ first_name: " Camille ", consultant_name: " TESAMI ", photo_url: "", video_url: "",
    join_url: "", whatsapp: "+33 (6) 12 34 56 78", notes: "", status: "active", quantity: 30,
    team_size: 5, per_member: 10, personal_sales: 10, expenses: [], slug: "inventé", visits: 200, owner_id: "autre" });
  assert.equal(row.first_name, "Camille");
  assert.equal(row.whatsapp, "33612345678");
  assert.equal(Object.hasOwn(row, "owner_id"), false);
  assert.equal(Object.hasOwn(row, "slug"), false);
  assert.equal(Object.hasOwn(row, "visits"), false);
});

test("construit le lien Chogan à partir du code sponsor et omet les médias absents", () => {
  const input = { first_name: "Camille", consultant_name: "TESAMI", whatsapp: "", notes: "",
    status: "active", quantity: 30, team_size: 5, per_member: 10, personal_sales: 10, expenses: [] };
  const registration = "https://www.chogangroupspa.com/registration_consultant/";
  assert.equal(validateSimulation({ ...input, join_url: " AbC123-4 " }).join_url, registration + "AbC123-4");
  assert.equal(referralInput(registration + "AbC123-4"), "AbC123-4");
  assert.equal(referralInput(registration + "AbC123-4/"), "AbC123-4");
  assert.equal(referralInput("https://exemple.com/parrainage"), "exemple.com/parrainage");
  const destination = "https://exemple.com/parrainage?ref=camille";
  for (const url of [destination, " exemple.com/parrainage?ref=camille "]) {
    const simulation = validateSimulation({ ...input, join_url: url });
    assert.equal(simulation.join_url, destination);
    assert.equal(Object.hasOwn(simulation, "photo_url"), false);
    assert.equal(Object.hasOwn(simulation, "video_url"), false);
  }
  assert.equal(validateSimulation({ ...input, join_url: "" }).join_url, "");
  for (const join_url of ["javascript:alert(1)", "//exemple.com", "exemple.com@autre.com", "code avec espaces", "http://exemple.com"]) {
    assert.throws(() => validateSimulation({ ...input, join_url }), /parrainage/);
  }
});
