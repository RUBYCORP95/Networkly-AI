"use server";

import { perfumeSession, loadCatalogue } from "../../lib/parfums/server";
import { audiences, levels, normalize, rankPerfumes } from "../../lib/parfums/expert.mjs";

export async function recommend(audience, notes, startingReference) {
  const { supabase, user } = await perfumeSession();
  if (!Object.hasOwn(audiences, audience) || !Array.isArray(notes) ||
      !notes.length || notes.length > 12 || notes.some(note => typeof note !== "string" || note.length > 120)) {
    return { error: "Choisis entre 1 et 12 notes olfactives." };
  }

  const { catalogue, unavailable } = await loadCatalogue(supabase);
  if (unavailable) return { error: "Le catalogue est temporairement indisponible." };
  const known = new Map(catalogue.flatMap(perfume => Object.keys(levels).flatMap(stage => perfume[stage]))
    .map(note => [normalize(note), note]));
  const keys = [...new Set(notes.map(normalize))];
  if (keys.some(key => !known.has(key))) return { error: "Une note a changé. Recharge le catalogue." };
  const preferences = keys.map(key => known.get(key));
  const basis = catalogue.find(perfume => perfume.reference === startingReference);
  const results = rankPerfumes(catalogue.filter(perfume => perfume !== basis), audience, preferences).slice(0, 12);
  if (basis && (audience === "tous" || basis.public_cible === audience)) {
    const [direct] = rankPerfumes([basis], audience, preferences);
    if (direct) results.unshift({ ...direct, direct: true });
  }
  const { data: entry, error } = await supabase.from("expert_parfums_historique").insert({
    user_id: user.id, public_cible: audience, preferences, reference_depart: basis?.reference,
    resultats: results.map(({ perfume, score }) => ({ reference: perfume.reference, nom: perfume.nom, score })),
  }).select("id,created_at,public_cible,preferences,resultats,reference_depart").single();

  return { results, entry, warning: error ? "La recherche a réussi, mais son historique n’a pas été enregistré." : null };
}
