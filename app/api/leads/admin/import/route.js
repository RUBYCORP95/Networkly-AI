import {createServerSupabase} from "../../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../../lib/supabase/admin";
import {requireActiveUser} from "../../../../../lib/auth/active-user";
function url(v){try{const u=new URL(String(v||""));return ["https:","http:"].includes(u.protocol)?u.href:null}catch{return null}}
function normalized(raw,source,index){
 const email=String(raw.email||raw.Email||"").trim().toLowerCase();
 const name=String(raw.name||raw.nom||raw.company||raw.entreprise||"").trim().slice(0,180);
 const city=String(raw.city||raw.ville||"").trim().slice(0,120);
 const website=url(raw.website||raw.site);
 const source_url=url(raw.source_url)||website||(email?"import:email:"+email:null);
 if(!name||!city||!source_url)return null;
 const socials={};for(const network of ["instagram","facebook","tiktok","linkedin","whatsapp"]){const value=url(raw[network]||raw.socials?.[network]);if(value)socials[network]=value}
 return {name,city,sector:String(raw.sector||raw.activite||"autre").slice(0,80),address:String(raw.address||raw.adresse||"").slice(0,240)||null,website,email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:null,phone:String(raw.phone||raw.telephone||"").slice(0,40)||null,socials,source_url,verified_at:null};
}
export async function POST(req){
 const session=await createServerSupabase();const access=await requireActiveUser(session);
 if(!access.ok)return Response.json({error:access.error},{status:access.status});
 if(!access.profile?.is_admin)return Response.json({error:"Accès administrateur requis"},{status:403});
 let body;try{body=await req.json()}catch{return Response.json({error:"JSON invalide"},{status:400})}
 if(!Array.isArray(body.rows)||body.rows.length<1||body.rows.length>200)return Response.json({error:"Envoyer entre 1 et 200 lignes par lot"},{status:400});
 const db=createAdminSupabase();let imported=0,invalid=0;const errors=[];
 for(let i=0;i<body.rows.length;i++){
  const row=normalized(body.rows[i],body.source,i);if(!row){invalid++;continue}
  const {error}=await db.from("lead_organizations").upsert(row,{onConflict:"source_url"});
  if(error)errors.push({row:i+1,error:error.message});else imported++;
 }
 return Response.json({imported,invalid,errors},{status:errors.length?207:200});
}
