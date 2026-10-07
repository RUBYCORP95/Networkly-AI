import {createServerSupabase} from "../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../lib/supabase/admin";
import {cancelMollieSubscription} from "../../../../lib/payments/mollie";
import {cancelPayPalSubscription} from "../../../../lib/payments/paypal";
import {syncKlaviyoBilling} from "../../../../lib/klaviyo";

export async function POST(){
 try{
  const s=await createServerSupabase();
  const {data:{user}}=await s.auth.getUser();
  if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const admin=createAdminSupabase();
  const {data:p,error}=await admin.from("profiles").select("plan,payment_provider,provider_customer_id,subscription_id").eq("id",user.id).single();
  if(error)return Response.json({error:"Abonnement introuvable"},{status:404});
  if(p?.plan!=="pro")return Response.json({ok:true,alreadyFree:true});
  if(p.payment_provider==="mollie"){
   if(!p.provider_customer_id||!p.subscription_id)return Response.json({error:"Abonnement Mollie incomplet"},{status:409});
   await cancelMollieSubscription({customerId:p.provider_customer_id,subscriptionId:p.subscription_id});
  }else if(p.payment_provider==="paypal"){
   if(!p.subscription_id)return Response.json({error:"Abonnement PayPal incomplet"},{status:409});
   await cancelPayPalSubscription({subscriptionId:p.subscription_id,reason:"Cancelled by customer"});
  }else return Response.json({error:"Prestataire d’abonnement inconnu"},{status:409});
  const now=new Date().toISOString();
  const {error:updateError}=await admin.from("profiles").update({plan:"free",subscription_status:"cancelled",payment_failed_at:null,grace_period_ends_at:null,updated_at:now}).eq("id",user.id);
  if(updateError)throw updateError;
  if(user.email)await syncKlaviyoBilling({email:user.email,userId:user.id,status:"cancelled",plan:"free"}).catch(()=>null);
  return Response.json({ok:true});
 }catch(e){return Response.json({error:e.message||"Résiliation impossible"},{status:500})}
}
