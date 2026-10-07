import {createServerSupabase} from "../../../../lib/supabase/server";
import {pollAlexya} from "../../../../lib/alexya";
function outputUrl(x){return x?.output_url||x?.url||x?.result?.url||x?.result?.output_url||x?.outputs?.[0]?.url||null}
export async function GET(req){
 try{
  const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const id=new URL(req.url).searchParams.get("id");const {data:row}=await s.from("ai_media_jobs").select("*").eq("id",id).eq("user_id",user.id).limit(1);const current=Array.isArray(row)?row[0]:row;if(!current)return Response.json({error:"Génération introuvable"},{status:404});
  if(current.status==="completed"&&current.output_url)return Response.json({job:current});
  const remote=await pollAlexya(current.poll_url||current.external_id);const raw=String(remote?.status||"processing").toLowerCase();const status=["completed","complete","succeeded","success","done","finished"].includes(raw)?"completed":["failed","error","cancelled","canceled"].includes(raw)?"failed":"processing";const url=outputUrl(remote);
  const {data:job,error}=await s.from("ai_media_jobs").update({status,output_url:url||current.output_url,updated_at:new Date().toISOString()}).eq("id",current.id).eq("user_id",user.id).select().limit(1);if(error)throw error;const saved=Array.isArray(job)?job[0]:job;
  return Response.json({job:saved||current});
 }catch(e){return Response.json({error:e.message||"Suivi impossible"},{status:500})}
}