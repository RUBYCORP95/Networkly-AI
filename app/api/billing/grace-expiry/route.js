import {createAdminSupabase} from "../../../../lib/supabase/admin";
import {syncKlaviyoBilling} from "../../../../lib/klaviyo";
import {cancelMollieSubscription} from "../../../../lib/payments/mollie";
import {cancelPayPalSubscription} from "../../../../lib/payments/paypal";

export async function POST(req){
 const auth=req.headers.get("authorization");
 if(!process.env.CRON_SECRET||auth!=="Bearer "+process.env.CRON_SECRET)return Response.json({error:"Non autorisé"},{status:401});

 const admin=createAdminSupabase();
 const now=new Date().toISOString();
 const {data,error}=await admin.from("profiles").select("id,payment_provider,provider_customer_id,subscription_id").in("subscription_status",["past_due","grace_expired_cancel_pending"]).lte("grace_period_ends_at",now);
 if(error)return Response.json({error:error.message},{status:500});

 const downgraded=[];
 const providerCancellationFailed=[];

 for(const x of data||[]){
  let providerCancelled=true;
  try{
   if(x.payment_provider==="mollie"&&x.provider_customer_id&&x.subscription_id){
    await cancelMollieSubscription({customerId:x.provider_customer_id,subscriptionId:x.subscription_id});
   }else if(x.payment_provider==="paypal"&&x.subscription_id){
    await cancelPayPalSubscription({subscriptionId:x.subscription_id});
   }
  }catch(error){
   providerCancelled=false;
   providerCancellationFailed.push({userId:x.id,provider:x.payment_provider,error:error?.message||"cancellation_failed"});
  }

  const {error:updateError}=await admin.from("profiles").update({
   plan:"free",
   account_status:"suspended",
   subscription_status:providerCancelled?"grace_expired":"grace_expired_cancel_pending",
   updated_at:now
  }).eq("id",x.id);
  if(updateError)continue;

  downgraded.push(x.id);
  const {data:u}=await admin.auth.admin.getUserById(x.id);
  if(u?.user?.email)await syncKlaviyoBilling({
   email:u.user.email,
   userId:x.id,
   status:providerCancelled?"grace_expired":"grace_expired_cancel_pending",
   plan:"free"
  }).catch(()=>null);
 }

 return Response.json({ok:true,downgraded:downgraded.length,providerCancellationFailed});
}
