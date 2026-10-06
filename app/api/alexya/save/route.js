import {createServerSupabase} from "../../../../lib/supabase/server";
export async function POST(req){
 try{
  const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const {jobId}=await req.json();const {data:job}=await s.from("ai_media_jobs").select("*").eq("id",jobId).eq("user_id",user.id).single();if(!job||job.status!=="completed"||!job.output_url)return Response.json({error:"Le média n’est pas encore prêt."},{status:409});
  const remote=await fetch(job.output_url);if(!remote.ok)throw new Error("Téléchargement du média impossible");
  const blob=await remote.blob();const isVideo=job.media_kind==="video";const ext=isVideo?"mp4":"webp";const type=blob.type||(isVideo?"video/mp4":"image/webp");const path=`${user.id}/library/ai-${job.id}.${ext}`;
  const {error:up}=await s.storage.from("content-media").upload(path,blob,{contentType:type,upsert:true});if(up)throw up;
  const {data:item,error}=await s.from("media_library").insert({user_id:user.id,source:"ai",media_path:path,media_type:type,original_name:`networkly-ai-${job.id}.${ext}`,title:job.prompt.slice(0,80),description:job.prompt,size_bytes:blob.size}).select().single();if(error)throw error;
  return Response.json({item});
 }catch(e){return Response.json({error:e.message||"Enregistrement impossible"},{status:500})}
}