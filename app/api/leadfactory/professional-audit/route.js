import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const response=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,role=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!role)return response({error:"Configuration incomplète"},503);
 const token=request.headers.get("authorization")?.replace(/^Bearer /i,"");
 if(!token)return response({error:"Connexion requise"},401);
 const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await auth.auth.getUser(token);
 if(error||!user)return response({error:"Session invalide"},401);
 const db=createClient(url,role,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile,error:profileError}=await db.from("profiles").select("is_admin").eq("id",user.id).maybeSingle();
 if(profileError||!profile?.is_admin)return response({error:"Administration uniquement"},403);
 const rows=[];for(let from=0;from<10000;from+=1000){
  const {data,error:loadError}=await db.from("lead_private_professional_imports")
   .select("id,company,sector,phone,email,address,postal_code,city,department,source,latitude,longitude,prospect_status")
   .order("id").range(from,from+999);
  if(loadError)return response({error:"Audit indisponible"},500);
  rows.push(...(data||[]));if((data||[]).length<1000)break;
 }
 const normalize=s=>String(s||"").toLowerCase().trim();
 const phones=new Map(),emails=new Map(),names=new Map();
 for(const r of rows){
  const p=String(r.phone||"").replace(/[^+0-9]/g,""),e=normalize(r.email),name=normalize(r.company)+"|"+normalize(r.postal_code);
  if(p)phones.set(p,(phones.get(p)||0)+1);
  if(e)emails.set(e,(emails.get(e)||0)+1);
  if(r.company&&r.postal_code)names.set(name,(names.get(name)||0)+1);
 }
 const stats={total:rows.length,qualityReady:0,needsReview:0,geocoded:0,duplicate:0,missingContact:0,missingLocation:0,missingSource:0,distributable:0};
 const records=rows.map(r=>{
  const p=String(r.phone||"").replace(/[^+0-9]/g,""),e=normalize(r.email);
  const reasons=[];
  if(!r.company||!r.sector)reasons.push("Entreprise ou activité manquante");
  if(!r.address||!r.postal_code||!r.city||!Number.isFinite(r.latitude)||!Number.isFinite(r.longitude))reasons.push("Adresse ou géolocalisation incomplète");
  if(!p&&!e)reasons.push("Aucun moyen de contact");
  if(!r.source)reasons.push("Source inconnue");
  if((p&&phones.get(p)>1)||(e&&emails.get(e)>1)||(r.company&&r.postal_code&&names.get(normalize(r.company)+"|"+normalize(r.postal_code))>1))reasons.push("Doublon possible");
  if(Number.isFinite(r.latitude)&&Number.isFinite(r.longitude))stats.geocoded++;
  if(reasons.some(x=>x.includes("Doublon")))stats.duplicate++;
  if(reasons.some(x=>x.includes("moyen de contact")))stats.missingContact++;
  if(reasons.some(x=>x.includes("géolocalisation")))stats.missingLocation++;
  if(reasons.some(x=>x.includes("Source")))stats.missingSource++;
  if(reasons.length)stats.needsReview++;else stats.qualityReady++;
  // Technical checks are not proof of a lawful right to prospect.
  const distributable=r.prospect_status==="eligible";
  if(distributable)stats.distributable++;
  return {id:r.id,company:r.company,city:r.city,department:r.department,quality:reasons.length?"review":"ready",reasons,distributable};
 });
 return response({stats,criteria:["Entreprise et activité renseignées","Adresse et géolocalisation complètes","Téléphone ou e-mail","Source identifiée","Aucun doublon détecté"],distributionRule:"Les contrôles techniques ne valent pas autorisation. Validation des droits de prospection et des oppositions requise avant distribution.",records:records.slice(0,300),truncated:records.length>300});
}
