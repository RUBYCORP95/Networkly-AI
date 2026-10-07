import {createServerSupabase} from "../../../lib/supabase/server";
import {requireActiveUser} from "../../../lib/auth/active-user";
export async function POST(request){
 try{
  const s=await createServerSupabase();const access=await requireActiveUser(s);if(!access.ok)return Response.json({error:access.error},{status:access.status});
  const data=await request.json();const p=data.profile||{};
  const prompt=`Tu es Networkly AI, assistant spécialisé en marketing de réseau. Crée un contenu ${data.type||"publication"} pour ${data.network||"Instagram"}. Objectif: ${data.goal||data.request||""}. Sujet: ${data.subject||"contenu du jour"}. Ton: ${data.tone||"Naturel"}. Profil vendeur: prénom ${p.name||"non renseigné"}, société ${p.company||"non renseignée"}, activité ${p.activity||"non renseignée"}, cible ${p.audience||"non renseignée"}. Lien boutique: ${p.shopUrl||"aucun"}. Lien inscription: ${p.joinUrl||"aucun"}. Reste naturel, évite les promesses de revenus ou résultats garantis, donne un CTA pertinent et un contenu directement publiable.`;
  if(!process.env.OPENAI_API_KEY)return Response.json({content:"Mode démo : configure OPENAI_API_KEY côté serveur pour activer la génération IA.\n\nTon profil et ta demande sont bien pris en compte par Networkly."});
  const r=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{"Content-Type":"application/json","Authorization":`Bearer ${process.env.OPENAI_API_KEY}`},body:JSON.stringify({model:process.env.OPENAI_MODEL||"gpt-5-mini",input:prompt})});
  const j=await r.json();if(!r.ok){console.error("OpenAI generate:",r.status,j?.error?.message||j?.error?.code);return Response.json({error:"Erreur du service IA."},{status:502})}
  const content=j.output_text||j?.output?.find(x=>x.type==="message")?.content?.find(x=>x.type==="output_text")?.text||"";
  if(!content)return Response.json({error:"TESAMI n’a reçu aucun texte de l’IA. Réessaie."},{status:502});
  return Response.json({content});
 }catch{return Response.json({error:"Requête invalide."},{status:400})}
}
