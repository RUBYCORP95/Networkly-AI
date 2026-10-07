import {createServerSupabase} from "../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../lib/supabase/admin";
import {calculatePrice} from "../../../../lib/pricing";
import {createMollieCustomer,createFirstMolliePayment} from "../../../../lib/payments/mollie";
import {paypalCall} from "../../../../lib/payments/paypal";
export async function POST(req){
 try{
  const supabase=await createServerSupabase();const {data:{user}}=await supabase.auth.getUser();
  if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const {provider,promoCode}=await req.json();if(!["mollie","paypal"].includes(provider))return Response.json({error:"Prestataire invalide"},{status:400});
  const admin=createAdminSupabase();
  const {data:settings}=await admin.from("app_settings").select("*").eq("id","main").single();
  const price=calculatePrice(settings||{},promoCode);
  const {data:profile}=await admin.from("profiles").select("*").eq("id",user.id).single();
  if(profile?.plan==="pro"&&profile?.subscription_status==="active")return Response.json({error:"Un abonnement Pro est déjà actif sur ce compte"},{status:409});
  if(profile?.subscription_status==="payment_pending")return Response.json({error:"Un paiement est déjà en attente de confirmation"},{status:409});
  if(provider==="mollie"){
   let customerId=profile?.payment_provider==="mollie"?profile.provider_customer_id:null;
   if(!customerId){const customer=await createMollieCustomer({name:profile?.full_name||user.email,email:user.email});customerId=customer.id;await admin.from("profiles").update({payment_provider:"mollie",provider_customer_id:customerId}).eq("id",user.id)}
   const payment=await createFirstMolliePayment({customerId,amount:price.total,currency:price.currency,userId:user.id});
   await admin.from("profiles").update({payment_provider:"mollie",subscription_id:null,subscription_status:"payment_pending"}).eq("id",user.id);
   return Response.json({url:payment._links?.checkout?.href});
  }
  if(!process.env.PAYPAL_PLAN_ID)return Response.json({error:"Plan PayPal non configuré"},{status:503});
  const sub=await paypalCall("/v1/billing/subscriptions",{method:"POST",body:JSON.stringify({plan_id:process.env.PAYPAL_PLAN_ID,custom_id:user.id,subscriber:{email_address:user.email},application_context:{brand_name:"Networkly AI",user_action:"SUBSCRIBE_NOW",return_url:`${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,cancel_url:`${process.env.NEXT_PUBLIC_APP_URL}/billing`}})});
  const approve=sub.links?.find(x=>x.rel==="approve")?.href;
  await admin.from("profiles").update({payment_provider:"paypal",subscription_id:sub.id,subscription_status:sub.status||"APPROVAL_PENDING"}).eq("id",user.id);
  return Response.json({url:approve});
 }catch(e){return Response.json({error:"Impossible de démarrer le paiement."},{status:500})}
}