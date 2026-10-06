import {createServerSupabase} from "../../../../lib/supabase/server";
import {metaPages} from "../../../../lib/social/meta";
export async function GET(){
 try{const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const {data:c}=await s.from("social_connections").select("*").eq("user_id",user.id).in("provider",["facebook","instagram"]).eq("connected",true).limit(1).maybeSingle();if(!c)return Response.json({pages:[]});
 const j=await metaPages(c);return Response.json({pages:(j.data||[]).map(p=>({id:p.id,name:p.name,instagram:p.instagram_business_account||null}))});
 }catch(e){return Response.json({error:e.message},{status:500})}}
