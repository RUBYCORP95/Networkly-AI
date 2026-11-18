import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const reply=(body,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
export async function GET(request){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,anon=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,role=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!role)return reply({error:"Configuration serveur incomplète"},503);
 const token=request.headers.get("authorization")?.replace(/^Bearer /i,"");
 if(!token)return reply({error:"Connexion requise"},401);
 const client=createClient(url,anon,{global:{headers:{Authorization:"Bearer "+token}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await client.auth.getUser(token);
 if(authError||!user)return reply({error:"Session invalide"},401);
 const {data:allowed,error:accessError}=await client.rpc("can_access_my_leads");
 if(accessError||allowed!==true)return reply({error:"Accès aux prospects non autorisé"},403);
 const db=createClient(url,role,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:pref,error:prefError}=await db.from("lead_preferences").select("city,radius_km,latitude,longitude").eq("user_id",user.id).maybeSingle();
 if(prefError)return reply({error:"Secteur indisponible"},500);
 if(!pref||!Number.isFinite(pref.latitude)||!Number.isFinite(pref.longitude)||pref.radius_km<5||pref.radius_km>50)return reply({error:"Enregistre un secteur valide avant la recherche"},422);
 const {data:candidates,error:candidateError}=await db.rpc("lead_geographic_candidates",{p_user_id:user.id,p_kind:"professional",p_limit:100});
 if(candidateError)return reply({error:"Recherche géographique indisponible"},500);
 const ids=(candidates||[]).map(x=>x.contact_id);
 let eligible=0;
 if(ids.length){
  const {data:records,error}=await db.from("lead_private_professional_imports").select("id").in("id",ids).eq("prospect_status","eligible");
  if(error)return reply({error:"Vérification des prospects impossible"},500);
  eligible=records?.length||0;
 }
 return reply({sector:pref.city,radius_km:pref.radius_km,available:eligible,previewLimit:100,ready:eligible>0,assigned:false,note:"Aucun prospect n'est réservé par cette recherche. Les coordonnées et identités ne sont pas divulguées."});
}
