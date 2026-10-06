import {createAdminSupabase} from "../../../../lib/supabase/admin";
import {paypalCall} from "../../../../lib/payments/paypal";
import {syncKlaviyoBilling} from "../../../../lib/klaviyo";
async function verified(req,body){
 if(!process.env.PAYPAL_WEBHOOK_ID)return false;
 const headers=req.headers;const result=await paypalCall("/v1/notifications/verify-webhook-signature",{method:"POST",body:JSON.stringify({auth_algo:headers.get("paypal-auth-algo"),cert_url:headers.get("paypal-cert-url"),transmission_id:headers.get("paypal-transmission-id"),transmission_sig:headers.get("paypal-transmission-sig"),transmission_time:headers.get("paypal-transmission-time"),webhook_id:process.env.PAYPAL_WEBHOOK_ID,webhook_event:body})});
 return result.verification_status==="SUCCESS";
}
export async function POST(req){
 try{
  const body=await req.json();if(!(await verified(req,body)))return new Response("invalid",{status:400});
  const admin=createAdminSupabase();const resource=body.resource||{};const userId=resource.custom_id;const subId=resource.id||resource.billing_agreement_id;
  if(!userId)return new Response("ok");await admin.from("billing_events").upsert({user_id:userId,provider:"paypal",provider_event_id:String(body.id||subId||crypto.randomUUID()),event_type:body.event_type||"webhook",status:String(resource.status||body.event_type||"unknown").toLowerCase(),amount:Number(resource.amount?.value||resource.billing_info?.last_payment?.amount?.value||0),currency:resource.amount?.currency_code||resource.billing_info?.last_payment?.amount?.currency_code||"EUR",subscription_id:subId||null},{onConflict:"provider,provider_event_id,event_type"});
  if(["BILLING.SUBSCRIPTION.ACTIVATED","BILLING.SUBSCRIPTION.RE-ACTIVATED"].includes(body.event_type)){const paidAt=new Date().toISOString();await admin.from("profiles").update({plan:"pro",payment_provider:"paypal",subscription_id:subId,subscription_status:"active",last_payment_at:paidAt,payment_failed_at:null,grace_period_ends_at:null,updated_at:paidAt}).eq("id",userId);const {data:u}=await admin.auth.admin.getUserById(userId);if(u?.user?.email)await syncKlaviyoBilling({email:u.user.email,userId,status:"active",plan:"pro",lastPaymentAt:paidAt}).catch(()=>null)}
  if(body.event_type==="BILLING.SUBSCRIPTION.PAYMENT.FAILED"){const failed=new Date(),grace=new Date(failed.getTime()+7*24*60*60*1000);await admin.from("profiles").update({subscription_status:"past_due",payment_failed_at:failed.toISOString(),grace_period_ends_at:grace.toISOString(),updated_at:failed.toISOString()}).eq("id",userId);const {data:u}=await admin.auth.admin.getUserById(userId);if(u?.user?.email)await syncKlaviyoBilling({email:u.user.email,userId,status:"past_due",plan:"pro",failedAt:failed.toISOString(),graceEndsAt:grace.toISOString()}).catch(()=>null)}
  if(["BILLING.SUBSCRIPTION.CANCELLED","BILLING.SUBSCRIPTION.EXPIRED"].includes(body.event_type))await admin.from("profiles").update({plan:"free",subscription_status:body.event_type.split(".").pop().toLowerCase(),updated_at:new Date().toISOString()}).eq("id",userId);
  return new Response("ok");
 }catch{return new Response("error",{status:500})}
}