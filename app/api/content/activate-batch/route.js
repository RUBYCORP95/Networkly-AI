import {createServerSupabase} from "../../../../lib/supabase/server";
import {requireActiveUser} from "../../../../lib/auth/active-user";
export async function POST(req){
 const s=await createServerSupabase();const access=await requireActiveUser(s);if(!access.ok)return Response.json({error:access.error},{status:access.status});const user=access.user;
 const b=await req.json();const ids=Array.isArray(b.ids)?b.ids.slice(0,31):[];const networks=Array.isArray(b.networks)?[...new Set(b.networks.filter(x=>["instagram","facebook","tiktok"].includes(x)))]:[];
 if(!ids.length||!networks.length)return Response.json({error:"Brouillons ou réseaux manquants."},{status:400});
 const publishMode=["approval","automatic"].includes(b.publishMode)?b.publishMode:"approval";const {data:connections}=await s.from("social_connections").select("provider").eq("user_id",user.id).eq("connected",true).in("provider",networks);const connected=new Set((connections||[]).map(x=>x.provider));const missing=networks.filter(x=>!connected.has(x));if(missing.length)return Response.json({error:`Connecte d’abord : ${missing.join(", ")}`},{status:409});
 const {data,error}=await s.rpc("activate_content_batch",{p_ids:ids,p_networks:networks,p_publish_mode:publishMode});
 if(error)return Response.json({error:"Impossible de programmer ces brouillons."},{status:409});
 return Response.json({ok:true,...data});
}