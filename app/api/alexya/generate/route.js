import {createServerSupabase} from "../../../../lib/supabase/server";
import {generateAlexyaImage,generateAlexyaVideo} from "../../../../lib/alexya";
export async function POST(req){
 try{
  const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const b=await req.json();const prompt=String(b.prompt||"").trim();const kind=b.kind==="video"?"video":"image";if(prompt.length<3)return Response.json({error:"Décris ce que tu veux créer."},{status:400});
  const referenceUrl=typeof b.referenceUrl==="string"&&b.referenceUrl.startsWith("https://")?b.referenceUrl:null;
  const job=kind==="video"
   ?await generateAlexyaVideo({prompt,aspectRatio:b.aspectRatio||"9:16",duration:Number(b.duration)||5,referenceImageUrls:referenceUrl?[referenceUrl]:[]})
   :await generateAlexyaImage({prompt,aspectRatio:b.aspectRatio||"1:1",imageUrls:referenceUrl?[referenceUrl]:[]});
  const {data,error}=await s.from("ai_media_jobs").insert({user_id:user.id,external_id:job.id,media_kind:kind,prompt,status:job.status||"processing",poll_url:job.poll_url,credits_charged:job.credits_charged||null}).select().limit(1);
  if(error)throw error;const saved=Array.isArray(data)?data[0]:data;if(!saved)throw new Error("La génération a été lancée mais TESAMI n’a pas pu enregistrer son suivi.");return Response.json({job:saved});
 }catch(e){return Response.json({error:e.message||"Generation impossible"},{status:500})}
}