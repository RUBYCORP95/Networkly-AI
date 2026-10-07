import {createServerSupabase} from "../../../../lib/supabase/server";
import {pollAlexya} from "../../../../lib/alexya";
function outputUrl(x){return x?.output_url||x?.url||x?.result?.url||x?.result?.output_url||x?.outputs?.[0]?.url||x?.data?.output_url||x?.data?.url||x?.data?.result?.url||x?.data?.outputs?.[0]?.url||x?.generation?.output_url||x?.generation?.url||null}
function normalizedStatus(x){const raw=String(x?.status||x?.data?.status||x?.generation?.status||"processing").toLowerCase();return ["completed","complete","succeeded","success","done","finished"].includes(raw)?"completed":["failed","error","cancelled","canceled"].includes(raw)?"failed":"processing"}
export async function POST(req){
 try{
  const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const {jobId}=await req.json();const {data:rows}=await s.from("ai_media_jobs").select("*").eq("id",jobId).eq("user_id",user.id).limit(1);let current=Array.isArray(rows)?rows[0]:rows;if(!current)return Response.json({error:"Génération introuvable"},{status:404});
  if(current.status!=="completed"||!current.output_url){
   try{const remote=await pollAlexya(current.poll_url||current.external_id);const status=normalizedStatus(remote),url=outputUrl(remote)||current.output_url;current={...current,status,output_url:url};await s.from("ai_media_jobs").update({status,output_url:url,updated_at:new Date().toISOString()}).eq("id",current.id).eq("user_id",user.id)}catch{}
  }
  if(!current.output_url)return Response.json({error:current.status==="failed"?"La génération a échoué.":"Le média est encore en cours de génération. Réessaie dans quelques secondes.",status:current.status},{status:409});
  const job=current;const remote=await fetch(job.output_url);if(!remote.ok)throw new Error("Téléchargement du média impossible");
  const blob=await remote.blob();const isVideo=job.media_kind==="video";const ext=isVideo?"mp4":blob.type.includes("png")?"png":blob.type.includes("jpeg")?"jpg":"webp";const type=blob.type||(isVideo?"video/mp4":"image/webp");const path=`${user.id}/library/ai-${job.id}.${ext}`;
  const {error:up}=await s.storage.from("content-media").upload(path,blob,{contentType:type,upsert:true});if(up)throw up;
  const {data:item,error}=await s.from("media_library").insert({user_id:user.id,source:"ai",media_path:path,media_type:type,original_name:`tesami-ai-${job.id}.${ext}`,title:job.prompt.slice(0,80),description:job.prompt,size_bytes:blob.size}).select().limit(1);if(error)throw error;const saved=Array.isArray(item)?item[0]:item;if(!saved)throw new Error("Le média a été envoyé mais la bibliothèque n’a pas renvoyé son enregistrement.");
  return Response.json({item:saved});
 }catch(e){return Response.json({error:e.message||"Enregistrement impossible"},{status:500})}
}