import {createClient} from "@supabase/supabase-js";
export const runtime="nodejs";
const reply=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
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
 if(!profile?.is_admin)return reply({error:"Réservé à l'administration"},403);
 const {id}=await request.json().catch(()=>({}));
 if(typeof id!=="string"||!/^[0-9a-f-]{36}$/i.test(id))return reply({error:"Identifiant invalide"},400);
 const {data:row,error:readError}=await db.from("lead_private_professional_imports").select("id,phone,email,prospect_status,admin_contacted_at").eq("id",id).maybeSingle();
 if(readError||!row)return reply({error:"Prospect introuvable"},404);
 if(row.admin_contacted_at)return reply({error:"Prospect déjà retiré de la liste à contacter"},409);
 if(!row.phone&&!row.email)return reply({error:"Aucune coordonnée disponible"},409);
 const {data:updated,error:updateError}=await db.from("lead_private_professional_imports")
 .update({admin_contacted_at:new Date().toISOString(),prospect_status:"contacted"})
 .eq("id",id).is("admin_contacted_at",null).select("id").maybeSingle();
 if(updateError||!updated)return reply({error:"Le prospect a déjà été pris en charge"},409);
 return reply({ok:true,phone:row.phone||null,email:row.email||null});
}
