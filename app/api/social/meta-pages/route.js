import {createServerSupabase} from "../../../../lib/supabase/server";
import {metaPages} from "../../../../lib/social/meta";
export async function GET(){
 try{const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const {data:connections}=await s.from("social_connections").select("*").eq("user_id",user.id).in("provider",["facebook","instagram"]).eq("connected",true);const list=connections||[];const c=list[0];if(!c)return Response.json({pages:[],connected:{facebook:false,instagram:false}});
 const j=await metaPages(c);return Response.json({pages:(j.data||[]).map(p=>({id:p.id,name:p.name,instagram:p.instagram_business_account||null})),connected:{facebook:list.some(x=>x.provider==="facebook"),instagram:list.some(x=>x.provider==="instagram")}});
 }catch(e){return Response.json({error:e.message},{status:500})}}
