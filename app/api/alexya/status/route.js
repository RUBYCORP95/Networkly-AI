import {createServerSupabase} from "../../../../lib/supabase/server";
import {pollAlexya} from "../../../../lib/alexya";
function outputUrl(x){return x?.output_url||x?.url||x?.result?.url||x?.result?.output_url||x?.outputs?.[0]?.url||null}
export async function GET(req){
 try{
  const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const id=new URL(req.url).searchParams.get("id");const {data:row}=await s.from("ai_media_jobs").select("*").eq("id",id).eq("user_id",user.id).single();if(!row)return Response.json({error:"Génération introuvable"},{status:404});
  if(row.status==="completed"&&row.output_url)return Response.json({job:row});
  const remote=await pollAlexya(row.poll_url||row.external_id);const status=remote.status||"processing";const url=outputUrl(remote);
  const {data:job,error}=await s.from("ai_media_jobs").update({status,output_url:url||row.output_url,updated_at:new Date().toISOString()}).eq("id",row.id).eq("user_id",user.id).select().single();if(error)throw error;
  return Response.json({job});
 }catch(e){return Response.json({error:e.message||"Suivi impossible"},{status:500})}
}