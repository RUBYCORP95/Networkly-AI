import {createServerSupabase} from "../../../../lib/supabase/server";
import {generateAlexyaImage,generateAlexyaVideo} from "../../../../lib/alexya";
export async function POST(req){
 try{
  const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const b=await req.json();const prompt=String(b.prompt||"").trim();const kind=b.kind==="video"?"video":"image";if(prompt.length<3)return Response.json({error:"Décris ce que tu veux créer."},{status:400});
  const job=kind==="video"?await generateAlexyaVideo({prompt,aspectRatio:b.aspectRatio||"9:16",duration:Number(b.duration)||5}):await generateAlexyaImage({prompt,aspectRatio:b.aspectRatio||"1:1"});
  const {data,error}=await s.from("ai_media_jobs").insert({user_id:user.id,external_id:job.id,media_kind:kind,prompt,status:job.status||"processing",poll_url:job.poll_url,credits_charged:job.credits_charged||null}).select().single();
  if(error)throw error;return Response.json({job:data});
 }catch(e){return Response.json({error:e.message||"Generation impossible"},{status:500})}
}