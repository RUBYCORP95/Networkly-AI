import {createAdminSupabase} from "../../../../lib/supabase/admin";
import {publishTarget} from "../../../../lib/social/runner";
function authorized(req){
 const auth=req.headers.get("authorization");
 return !!process.env.CRON_SECRET&&auth==="Bearer "+process.env.CRON_SECRET;
}
export async function POST(req){
 if(!authorized(req))return Response.json({error:"Non autorisé"},{status:401});
 const db=createAdminSupabase();let requestedId=null;try{requestedId=(await req.json())?.contentId||null}catch{}let targets=[];if(requestedId){const {data,error}=await db.from("publish_targets").select("*").eq("content_id",requestedId).eq("status","pending");if(error)return Response.json({error:error.message},{status:500});targets=data||[]}else{const claimedRpc=await db.rpc("claim_publish_targets",{p_limit:20});if(claimedRpc.error)return Response.json({error:claimedRpc.error.message},{status:500});targets=claimedRpc.data||[]}
 const claimed=targets;const results=[];
 for(const target of claimed){
  try{
   const {data:content}=await db.from("content_items").select("*").eq("id",target.content_id).single();
   const {data:connection}=await db.from("social_connections").select("*").eq("user_id",target.user_id).eq("provider",target.provider).eq("connected",true).limit(1).maybeSingle();
   if(!content||!connection)throw new Error("Réseau non connecté");
   const {data:signed,error:signError}=await db.storage.from("content-media").createSignedUrl(content.media_path,600);if(signError||!signed?.signedUrl)throw new Error("Média indisponible");
   let bytes=null;let type=content.media_type||"application/octet-stream";if(target.provider==="tiktok"){const media=await fetch(signed.signedUrl);if(!media.ok)throw new Error("Lecture média impossible");bytes=await media.arrayBuffer();type=content.media_type||media.headers.get("content-type")||type}
   const out=await publishTarget({db,target,content,connection,mediaUrl:signed.signedUrl,mediaBytes:bytes,mediaType:type});
   if(!out?.id)throw new Error("Instagram/Meta n’a renvoyé aucun identifiant de publication");const now=new Date().toISOString();await db.from("publish_targets").update({status:"published",provider_post_id:out.id||null,published_at:now,last_error:null,updated_at:now}).eq("id",target.id);
   await db.from("publish_logs").insert({user_id:target.user_id,content_id:target.content_id,provider:target.provider,status:"published",provider_post_id:out.id||null});
   await db.rpc("refresh_content_publish_status",{p_content_id:target.content_id});results.push({id:target.id,provider:target.provider,status:"published",providerPostId:out.id,username:out.username||null,permalink:out.permalink||null});
  }catch(e){
   const retry=target.attempts<3;await db.from("publish_targets").update({status:retry?"retry":"failed",last_error:e.message,updated_at:new Date().toISOString()}).eq("id",target.id);
   await db.from("publish_logs").insert({user_id:target.user_id,content_id:target.content_id,provider:target.provider,status:retry?"retry":"failed",error_message:e.message});
   await db.rpc("refresh_content_publish_status",{p_content_id:target.content_id});results.push({id:target.id,provider:target.provider,status:retry?"retry":"failed",error:e.message});
  }
 }
 if(requestedId&&!results.length)return Response.json({processed:0,results:[],ok:false,error:"La publication n’a pas été prise en charge par le moteur d’envoi."},{status:502});const failures=results.filter(x=>x.status!=="published");return Response.json({processed:results.length,results,ok:failures.length===0,error:failures[0]?.error||null},{status:failures.length?502:200});
}