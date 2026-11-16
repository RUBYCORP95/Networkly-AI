import {createServerSupabase} from "../../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../../lib/supabase/admin";
import {requireActiveUser} from "../../../../../lib/auth/active-user";

const DAY=24*60*60*1000;
const MAX_ROWS=200;
function parseDate(value){
 if(value===null||value===undefined||String(value).trim()==="")return null;
 const n=Date.parse(String(value));
 return Number.isFinite(n)?new Date(n):null;
}
function normalize(row,now){
 const id=String(row.klaviyo_profile_id||row.profile_id||"").trim().slice(0,120);
 const email=String(row.email||"").trim().toLowerCase();
 const phone=String(row.phone||row.phone_number||"").trim().slice(0,40);
 const city=String(row.city||row.location?.city||"").trim().slice(0,120);
 const department=String(row.department||row.departement||row.location?.region||"").trim().slice(0,120);
 if(!city&&!department)return {ok:false,reason:"Ville ou département obligatoire"};
 if(phone.replace(/[^0-9]/g,"").length<8)return {ok:false,reason:"Numéro de téléphone obligatoire (8 chiffres minimum)"};
 const abandoned=parseDate(row.last_abandoned_at);
 const order=parseDate(row.last_order_at);
 const checked=parseDate(row.orders_checked_at);
 if(!id||!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return {ok:false,reason:"Identifiant Klaviyo ou email invalide"};
 if(!abandoned)return {ok:false,reason:"Date du panier abandonné manquante"};
 if(!checked)return {ok:false,reason:"Vérification des commandes manquante"};
 if(abandoned.getTime()>now-60*DAY)return {ok:false,reason:"Panier abandonné depuis moins de 60 jours"};
 if(checked.getTime()<now-DAY||checked.getTime()>now+5*60*1000||checked<abandoned)return {ok:false,reason:"Historique des commandes non vérifié récemment"};
 if(row.last_order_at&& !order)return {ok:false,reason:"Date de commande invalide"};
 if(order&&order.getTime()>abandoned.getTime())return {ok:false,reason:"Nouvelle commande après l'abandon"};
 const consent=String(row.consent_status||"unknown").trim().toLowerCase();
 const safeConsent=["subscribed","unsubscribed","suppressed","unknown"].includes(consent)?consent:"unknown";
 return {ok:true,contact:{
  klaviyo_profile_id:id,email,
  first_name:String(row.first_name||"").trim().slice(0,100)||null,
  last_name:String(row.last_name||"").trim().slice(0,100)||null,
  phone,city:city||null,department:department||null,
  last_abandoned_at:abandoned.toISOString(),
  last_order_at:order?.toISOString()||null,
  orders_checked_at:checked.toISOString(),
  consent_status:safeConsent,source_segment_id:"RbHGeT",
  updated_at:new Date(now).toISOString()
 }};
}
async function authorize(){
 const session=await createServerSupabase();
 const access=await requireActiveUser(session);
 if(!access.ok)return {error:Response.json({error:access.error},{status:access.status})};
 if(!access.profile?.is_admin)return {error:Response.json({error:"Accès administrateur requis"},{status:403})};
 return {db:createAdminSupabase()};
}
export async function GET(){
 const {db,error}=await authorize();if(error)return error;
 const {data,error:queryError,count}=await db.from("lead_private_klaviyo_contacts")
  .select("id,klaviyo_profile_id,email,phone,city,department,first_name,last_name,last_abandoned_at,consent_status,imported_at",
   {count:"exact"}).order("imported_at",{ascending:false}).limit(30);
 if(queryError)return Response.json({error:"Lecture des contacts privés impossible"},{status:503});
 return Response.json({contacts:data||[],count:count||0,criteria:"abandon >= 60 jours, aucune commande ultérieure, contrôle des commandes dans les 24 h, email + téléphone + ville ou département obligatoires",source_segment_id:"RbHGeT"},
  {headers:{"Cache-Control":"no-store"}});
}
export async function POST(req){
 const {db,error}=await authorize();if(error)return error;
 let body;try{body=await req.json()}catch{return Response.json({error:"JSON invalide"},{status:400})}
 if(!Array.isArray(body.rows)||body.rows.length<1||body.rows.length>MAX_ROWS)return Response.json({error:"Fournir 1 à 200 contacts par lot"},{status:400});
 if(!["preview","import"].includes(body.mode))return Response.json({error:"Mode invalide"},{status:400});
 const now=Date.now();
 const accepted=[],rejected=[];
 for(let i=0;i<body.rows.length;i++){
  const result=normalize(body.rows[i]||{},now);
  if(result.ok)accepted.push(result.contact);else rejected.push({row:i+1,reason:result.reason});
 }
 if(body.mode==="preview")return Response.json({eligible:accepted.length,rejected,preview:accepted.slice(0,5).map(({email,...x})=>({...x,email_masked:email.replace(/^(.{1,2}).*(@.*)$/,"$1***$2")})),total:body.rows.length,imported:0});
 if(!accepted.length)return Response.json({error:"Aucun contact ne satisfait les critères",rejected},{status:422});
 // No contact is ever written to lead_organizations or lead_assignments.
 const {data,error:writeError}=await db.from("lead_private_klaviyo_contacts")
  .upsert(accepted,{onConflict:"klaviyo_profile_id"}).select("id");
 if(writeError)return Response.json({error:"Import privé impossible"},{status:503});
 return Response.json({imported:data?.length||0,rejected,private:true,assigned:0});
}
