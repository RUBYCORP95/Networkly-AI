import {createAdminSupabase} from "../../../../lib/supabase/admin";
import {getMolliePayment,createMollieSubscription} from "../../../../lib/payments/mollie";
import {syncKlaviyoBilling} from "../../../../lib/klaviyo";
export async function POST(req){
 try{
  const form=await req.formData();const id=form.get("id");if(!id)return new Response("ok");
  const payment=await getMolliePayment(id);const userId=payment.metadata?.userId;if(!userId)return new Response("ok");
  const admin=createAdminSupabase();
  if(payment.status==="paid"){
   const {data:p}=await admin.from("profiles").select("*").eq("id",userId).single();
   let subscriptionId=p?.subscription_id;
   if(!subscriptionId){const sub=await createMollieSubscription({customerId:payment.customerId,amount:payment.amount.value,currency:payment.amount.currency,userId});subscriptionId=sub.id}
   const paidAt=new Date().toISOString();await admin.from("profiles").update({plan:"pro",payment_provider:"mollie",provider_customer_id:payment.customerId,subscription_id:subscriptionId,subscription_status:"active",last_payment_at:paidAt,payment_failed_at:null,grace_period_ends_at:null,updated_at:paidAt}).eq("id",userId);const {data:u}=await admin.auth.admin.getUserById(userId);if(u?.user?.email)await syncKlaviyoBilling({email:u.user.email,userId,status:"active",plan:"pro",lastPaymentAt:paidAt}).catch(()=>null);
  }else if(["failed","canceled","expired"].includes(payment.status)){{const failed=new Date(),grace=new Date(failed.getTime()+7*24*60*60*1000);await admin.from("profiles").update({subscription_status:"past_due",payment_failed_at:failed.toISOString(),grace_period_ends_at:grace.toISOString(),updated_at:failed.toISOString()}).eq("id",userId);const {data:u}=await admin.auth.admin.getUserById(userId);if(u?.user?.email)await syncKlaviyoBilling({email:u.user.email,userId,status:"past_due",plan:"pro",failedAt:failed.toISOString(),graceEndsAt:grace.toISOString()}).catch(()=>null)}}
  return new Response("ok");
 }catch{return new Response("ok")}
}