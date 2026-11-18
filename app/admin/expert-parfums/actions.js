"use server";

import { revalidatePath } from "next/cache";
import { perfumeSession } from "../../../lib/parfums/server";
import { audiences, levels, normalize } from "../../../lib/parfums/expert.mjs";

export async function savePerfume(_previous, formData) {
  const { supabase } = await perfumeSession(true);
  const field = key => String(formData.get(key) ?? "").trim();
  const reference = field("reference").toUpperCase();
  const editing = field("edition");
  const nom = field("nom");
  const inspiration = field("inspiration");
  const publicCible = field("public_cible");
  const famille = field("famille");
  const source = field("source");
  const page = field("source_page");
  const publie = formData.has("publie");
  let url;
  try { url = new URL(source); } catch {}
  if (!/^[A-Z0-9-]{1,24}$/.test(reference) || (editing && editing !== reference) ||
      !nom || nom.length > 120 || inspiration.length > 160 || !famille || famille.length > 120 ||
      publicCible === "tous" || !Object.hasOwn(audiences, publicCible) ||
      url?.protocol !== "https:" || url.username || url.password || source.length > 1500 ||
      (page && (!/^\d+$/.test(page) || Number(page) < 1 || Number(page) > 10000))) {
    return { error: "Vérifie la référence, les champs de la fiche et le lien HTTPS de la source." };
  }
  const pyramid = Object.fromEntries(Object.keys(levels).map(stage => {
    const notes = field(stage).split(/\r?\n/).map(note => note.trim()).filter(Boolean);
    return [stage, [...new Map(notes.map(note => [normalize(note), note])).values()]];
  }));
  if (Object.values(pyramid).some(notes => notes.length > 40 || notes.some(note => note.length > 120)) ||
      (publie && !Object.values(pyramid).some(notes => notes.length))) {
    return { error: "Indique une note par ligne, jusqu’à 40 par niveau. Une fiche publiée doit contenir des notes sourcées." };
  }
  const row = { nom, inspiration, public_cible: publicCible, famille, source: url.href,
    source_page: page ? Number(page) : null, publie, ...pyramid };
  const table = supabase.from("expert_parfums_catalogue");
  const { error } = await (editing ? table.update(row).eq("reference", reference) : table.insert({ reference, ...row }))
    .select("reference").single();
  if (error) return { error: error.code === "23505" ? "Cette référence existe déjà. Ouvre sa fiche pour la modifier." : "La fiche n’a pas été enregistrée." };
  revalidatePath("/expert-parfums");
  revalidatePath(`/expert-parfums/${reference}`);
  revalidatePath("/admin/expert-parfums");
  return { success: `Fiche ${reference} enregistrée.` };
}
