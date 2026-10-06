import {createAdminSupabase} from "../../../../lib/supabase/admin";
import {getMolliePayment,createMollieSubscription} from "../../../../lib/payments/mollie";
export async function POST(req){
 try{
  const form=await req.formData();const id=form.get("id");if(!id)return new Response("ok");
  const payment=await getMolliePayment(id);const userId=payment.metadata?.userId;if(!userId)return new Response("ok");
  const admin=createAdminSupabase();
  if(payment.status==="paid"){
   const {data:p}=await admin.from("profiles").select("*").eq("id",userId).single();
   let subscriptionId=p?.subscription_id;
   if(!subscriptionId){const sub=await createMollieSubscription({customerId:payment.customerId,amount:payment.amount.value,currency:payment.amount.currency,userId});subscriptionId=sub.id}
   await admin.from("profiles").update({plan:"pro",payment_provider:"mollie",provider_customer_id:payment.customerId,subscription_id:subscriptionId,subscription_status:"active",updated_at:new Date().toISOString()}).eq("id",userId);
  }else if(["failed","canceled","expired"].includes(payment.status)){await admin.from("profiles").update({subscription_status:payment.status,updated_at:new Date().toISOString()}).eq("id",userId)}
  return new Response("ok");
 }catch{return new Response("ok")}
}