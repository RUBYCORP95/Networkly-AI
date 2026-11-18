import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
const reply=(x,status=200)=>Response.json(x,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,role=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!role)return reply({error:"Configuration incomplète"},503);
 const token=request.headers.get("authorization")?.replace(/^Bearer /i,"");
 if(!token)return reply({error:"Connexion requise"},401);
 const auth=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error}=await auth.auth.getUser(token);
 if(error||!user)return reply({error:"Session invalide"},401);
 const db=createClient(url,role,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:profile}=await db.from("profiles").select("is_admin").eq("id",user.id).maybeSingle();
 if(!profile?.is_admin)return reply({error:"Administration uniquement"},403);
 const body=await request.json().catch(()=>({}));
 if(!/^[0-9a-f-]{36}$/i.test(body.id||"")||body.confirmed!==true)return reply({error:"Identifiant et confirmation explicite requis"},400);
 const {data:r,error:readError}=await db.from("lead_private_professional_imports")
 .select("id,company,sector,phone,email,address,postal_code,city,source,latitude,longitude,prospect_status").eq("id",body.id).maybeSingle();
 if(readError||!r)return reply({error:"Fiche introuvable"},404);
 if(r.prospect_status==="eligible")return reply({ok:true,alreadyApproved:true});
 if(r.prospect_status!=="À contacter")return reply({error:"Statut incompatible avec la validation"},409);
 if(!r.company||!r.sector||!r.address||!r.postal_code||!r.city||!r.source||(!r.phone&&!r.email)||!Number.isFinite(r.latitude)||!Number.isFinite(r.longitude))return reply({error:"Fiche incomplète : corrige les anomalies avant validation"},409);
 const {data:rows,error:dupError}=await db.from("lead_private_professional_imports").select("id,company,postal_code,phone,email").neq("id",r.id);
 if(dupError)return reply({error:"Contrôle des doublons indisponible"},500);
 const norm=x=>String(x||"").trim().toLowerCase(),digits=x=>String(x||"").replace(/[^+0-9]/g,"");
 if((rows||[]).some(x=>(r.phone&&x.phone&&digits(r.phone)===digits(x.phone))||(r.email&&x.email&&norm(r.email)===norm(x.email))||(norm(r.company)===norm(x.company)&&norm(r.postal_code)===norm(x.postal_code))))return reply({error:"Doublon potentiel : validation refusée"},409);
 // Admin explicitly attests that professional prospecting is appropriate, source and opposition checked.
 const {data:updated,error:updateError}=await db.from("lead_private_professional_imports")
 .update({prospect_status:"eligible"}).eq("id",r.id).eq("prospect_status","À contacter").select("id").maybeSingle();
 if(updateError||!updated)return reply({error:"La fiche a changé : recharge le contrôle"},409);
 return reply({ok:true,approved:r.id});
}
