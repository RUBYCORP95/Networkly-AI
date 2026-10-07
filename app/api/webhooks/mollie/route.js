import {createAdminSupabase} from "../../../../lib/supabase/admin";
import {getMolliePayment,createMollieSubscription} from "../../../../lib/payments/mollie";
import {syncKlaviyoBilling} from "../../../../lib/klaviyo";
export async function POST(req){
 try{
  const form=await req.formData();const id=form.get("id");if(!id)return new Response("ok");
  const payment=await getMolliePayment(id);const userId=payment.metadata?.userId;if(!userId)return new Response("ok");
  const admin=createAdminSupabase();await admin.from("billing_events").upsert({user_id:userId,provider:"mollie",provider_event_id:String(payment.id||id),event_type:"payment",status:payment.status,amount:Number(payment.amount?.value||0),currency:payment.amount?.currency||"EUR",subscription_id:payment.subscriptionId||null},{onConflict:"provider,provider_event_id,event_type"});
  if(payment.status==="paid"){
   const {data:p}=await admin.from("profiles").select("*").eq("id",userId).single();
   let subscriptionId=p?.subscription_id;
   if(!subscriptionId){const sub=await createMollieSubscription({customerId:payment.customerId,amount:payment.amount.value,currency:payment.amount.currency,userId});subscriptionId=sub.id}
   const paidAt=new Date().toISOString();await admin.from("profiles").update({plan:"pro",account_status:"active",payment_provider:"mollie",provider_customer_id:payment.customerId,subscription_id:subscriptionId,subscription_status:"active",last_payment_at:paidAt,payment_failed_at:null,grace_period_ends_at:null,updated_at:paidAt}).eq("id",userId);const {data:u}=await admin.auth.admin.getUserById(userId);if(u?.user?.email)await syncKlaviyoBilling({email:u.user.email,userId,status:"active",plan:"pro",lastPaymentAt:paidAt}).catch(()=>null);
  }else if(["canceled","expired"].includes(payment.status)){await admin.from("profiles").update({plan:"free",subscription_status:payment.status,payment_failed_at:null,grace_period_ends_at:null,updated_at:new Date().toISOString()}).eq("id",userId)}else if(payment.status==="failed"){{const {data:existing}=await admin.from("profiles").select("subscription_status,grace_period_ends_at").eq("id",userId).single();if(existing?.subscription_status==="past_due"&&existing?.grace_period_ends_at)return new Response("ok");const failed=new Date(),grace=new Date(failed.getTime()+7*24*60*60*1000);await admin.from("profiles").update({subscription_status:"past_due",payment_failed_at:failed.toISOString(),grace_period_ends_at:grace.toISOString(),updated_at:failed.toISOString()}).eq("id",userId);const {data:u}=await admin.auth.admin.getUserById(userId);if(u?.user?.email)await syncKlaviyoBilling({email:u.user.email,userId,status:"past_due",plan:"pro",failedAt:failed.toISOString(),graceEndsAt:grace.toISOString()}).catch(()=>null)}}
  return new Response("ok");
 }catch{return new Response("ok")}
}