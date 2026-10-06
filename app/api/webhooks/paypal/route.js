import {createAdminSupabase} from "../../../../lib/supabase/admin";
import {paypalCall} from "../../../../lib/payments/paypal";
async function verified(req,body){
 if(!process.env.PAYPAL_WEBHOOK_ID)return false;
 const headers=req.headers;const result=await paypalCall("/v1/notifications/verify-webhook-signature",{method:"POST",body:JSON.stringify({auth_algo:headers.get("paypal-auth-algo"),cert_url:headers.get("paypal-cert-url"),transmission_id:headers.get("paypal-transmission-id"),transmission_sig:headers.get("paypal-transmission-sig"),transmission_time:headers.get("paypal-transmission-time"),webhook_id:process.env.PAYPAL_WEBHOOK_ID,webhook_event:body})});
 return result.verification_status==="SUCCESS";
}
export async function POST(req){
 try{
  const body=await req.json();if(!(await verified(req,body)))return new Response("invalid",{status:400});
  const admin=createAdminSupabase();const resource=body.resource||{};const userId=resource.custom_id;const subId=resource.id||resource.billing_agreement_id;
  if(!userId)return new Response("ok");
  if(["BILLING.SUBSCRIPTION.ACTIVATED","BILLING.SUBSCRIPTION.RE-ACTIVATED"].includes(body.event_type))await admin.from("profiles").update({plan:"pro",payment_provider:"paypal",subscription_id:subId,subscription_status:"active",updated_at:new Date().toISOString()}).eq("id",userId);
  if(["BILLING.SUBSCRIPTION.CANCELLED","BILLING.SUBSCRIPTION.EXPIRED","BILLING.SUBSCRIPTION.SUSPENDED"].includes(body.event_type))await admin.from("profiles").update({plan:"free",subscription_status:body.event_type.split(".").pop().toLowerCase(),updated_at:new Date().toISOString()}).eq("id",userId);
  return new Response("ok");
 }catch{return new Response("error",{status:500})}
}