import {createAdminSupabase} from "../../../../lib/supabase/admin";
import {publishTarget} from "../../../../lib/social/runner";
import {syncKlaviyoBilling} from "../../../../lib/klaviyo";
import {cancelMollieSubscription} from "../../../../lib/payments/mollie";
import {cancelPayPalSubscription} from "../../../../lib/payments/paypal";

function authorized(req){
 const auth=req.headers.get("authorization");
 return !!process.env.CRON_SECRET&&auth==="Bearer "+process.env.CRON_SECRET;
}
async function publishDue(db){
 const {data:targets,error}=await db.rpc("claim_publish_targets",{p_limit:20});if(error)throw error;const results=[];
 for(const target of targets||[]){try{
  const {data:content}=await db.from("content_items").select("*").eq("id",target.content_id).single();
  const {data:connection}=await db.from("social_connections").select("*").eq("user_id",target.user_id).eq("provider",target.provider).eq("connected",true).limit(1).maybeSingle();
  if(!content||!connection)throw new Error("Réseau non connecté");
  const {data:signed,error:signError}=await db.storage.from("content-media").createSignedUrl(content.media_path,600);if(signError||!signed?.signedUrl)throw new Error("Média indisponible");
  let bytes=null,type=content.media_type||"application/octet-stream";if(target.provider==="tiktok"){const media=await fetch(signed.signedUrl);if(!media.ok)throw new Error("Lecture média impossible");bytes=await media.arrayBuffer();type=content.media_type||media.headers.get("content-type")||type}
  const out=await publishTarget({db,target,content,connection,mediaUrl:signed.signedUrl,mediaBytes:bytes,mediaType:type});const now=new Date().toISOString();
  await db.from("publish_targets").update({status:"published",provider_post_id:out.id||null,published_at:now,last_error:null,updated_at:now}).eq("id",target.id);
  await db.from("publish_logs").insert({user_id:target.user_id,content_id:target.content_id,provider:target.provider,status:"published",provider_post_id:out.id||null});
  await db.rpc("refresh_content_publish_status",{p_content_id:target.content_id});results.push({id:target.id,provider:target.provider,status:"published"});
 }catch(e){const retry=target.attempts<3;await db.from("publish_targets").update({status:retry?"retry":"failed",last_error:e.message,updated_at:new Date().toISOString()}).eq("id",target.id);await db.from("publish_logs").insert({user_id:target.user_id,content_id:target.content_id,provider:target.provider,status:retry?"retry":"failed",error_message:e.message});await db.rpc("refresh_content_publish_status",{p_content_id:target.content_id});results.push({id:target.id,provider:target.provider,status:retry?"retry":"failed"});}}
 return results;
}
async function expireGrace(db){
 const now=new Date().toISOString();const {data,error}=await db.from("profiles").select("id,payment_provider,provider_customer_id,subscription_id").in("subscription_status",["past_due","grace_expired_cancel_pending"]).lte("grace_period_ends_at",now);if(error)throw error;let count=0;
 for(const x of data||[]){let providerCancelled=true;try{if(x.payment_provider==="mollie"&&x.provider_customer_id&&x.subscription_id)await cancelMollieSubscription({customerId:x.provider_customer_id,subscriptionId:x.subscription_id});else if(x.payment_provider==="paypal"&&x.subscription_id)await cancelPayPalSubscription({subscriptionId:x.subscription_id})}catch{providerCancelled=false}
  const {error:updateError}=await db.from("profiles").update({plan:"free",account_status:"suspended",subscription_status:providerCancelled?"grace_expired":"grace_expired_cancel_pending",updated_at:now}).eq("id",x.id);if(updateError)continue;count++;
  const {data:u}=await db.auth.admin.getUserById(x.id);if(u?.user?.email)await syncKlaviyoBilling({email:u.user.email,userId:x.id,status:providerCancelled?"grace_expired":"grace_expired_cancel_pending",plan:"free"}).catch(()=>null);
 }return count;
}
export async function GET(req){if(!authorized(req))return Response.json({error:"Non autorisé"},{status:401});const db=createAdminSupabase();try{const [published,expired]=await Promise.all([publishDue(db),expireGrace(db)]);return Response.json({ok:true,published:published.length,publishResults:published,expiredGrace:expired})}catch(e){return Response.json({error:e.message||"Cron impossible"},{status:500})}}
export const POST=GET;
