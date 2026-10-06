import {createAdminSupabase} from "../../../../lib/supabase/admin";
import {publishTarget} from "../../../../lib/social/runner";
export async function POST(req){
 if(req.headers.get("authorization")!=="Bearer "+process.env.CRON_SECRET)return Response.json({error:"Non autorisé"},{status:401});
 const db=createAdminSupabase();const {data:targets,error}=await db.rpc("claim_publish_targets",{p_limit:20});if(error)return Response.json({error:error.message},{status:500});
 const results=[];
 for(const target of targets||[]){
  try{
   const {data:content}=await db.from("content_items").select("*").eq("id",target.content_id).single();
   const {data:connection}=await db.from("social_connections").select("*").eq("user_id",target.user_id).eq("provider",target.provider).eq("connected",true).limit(1).maybeSingle();
   if(!content||!connection)throw new Error("Réseau non connecté");
   const {data:signed,error:signError}=await db.storage.from("content-media").createSignedUrl(content.media_path,600);if(signError||!signed?.signedUrl)throw new Error("Média indisponible");
   const media=await fetch(signed.signedUrl);if(!media.ok)throw new Error("Lecture média impossible");const bytes=await media.arrayBuffer();const type=content.media_type||media.headers.get("content-type")||"application/octet-stream";
   const out=await publishTarget({db,target,content,connection,mediaUrl:signed.signedUrl,mediaBytes:bytes,mediaType:type});
   const now=new Date().toISOString();await db.from("publish_targets").update({status:"published",provider_post_id:out.id||null,published_at:now,last_error:null,updated_at:now}).eq("id",target.id);
   await db.from("publish_logs").insert({user_id:target.user_id,content_id:target.content_id,provider:target.provider,status:"published",provider_post_id:out.id||null});
   await db.rpc("refresh_content_publish_status",{p_content_id:target.content_id});results.push({id:target.id,provider:target.provider,status:"published"});
  }catch(e){
   const retry=target.attempts<3;await db.from("publish_targets").update({status:retry?"retry":"failed",last_error:e.message,updated_at:new Date().toISOString()}).eq("id",target.id);
   await db.from("publish_logs").insert({user_id:target.user_id,content_id:target.content_id,provider:target.provider,status:retry?"retry":"failed",error_message:e.message});
   await db.rpc("refresh_content_publish_status",{p_content_id:target.content_id});results.push({id:target.id,provider:target.provider,status:retry?"retry":"failed"});
  }
 }
 return Response.json({processed:results.length,results});
}