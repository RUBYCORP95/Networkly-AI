import {createServerSupabase} from "../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../lib/supabase/admin";
import {calculatePrice} from "../../../../lib/pricing";
import {createMollieCustomer,createFirstMolliePayment} from "../../../../lib/payments/mollie";
import {paypalCall} from "../../../../lib/payments/paypal";
export async function POST(req){
 try{
  const supabase=await createServerSupabase();const {data:{user}}=await supabase.auth.getUser();
  if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const {provider,promoCode,expectedCents}=await req.json();if(!["mollie","paypal"].includes(provider))return Response.json({error:"Prestataire invalide"},{status:400});
  const admin=createAdminSupabase();
  const {data:settings}=await admin.from("app_settings").select("*").eq("id","main").single();
  const {data: tariff,error: tariffError}=await admin.from("subscription_prices").select("cents").eq("code","pro").single();
  if(tariffError||!tariff)return Response.json({error:"Tarif Pro indisponible."},{status:503});
  if(expectedCents!==tariff.cents)return Response.json({error:"Le tarif a changé. Recharge la page avant de payer."},{status:409});
  const price=calculatePrice({...settings,monthly_price:tariff.cents/100,currency:"EUR"},promoCode);
  const {data:profile,error:profileError}=await admin.from("profiles").select("*").eq("id",user.id).single();
  if(profileError||!profile)return Response.json({error:"Compte de facturation indisponible."},{status:503});
  const subscriptionStatus=String(profile.subscription_status||"").toLowerCase();
  if(profile.subscription_id&&["active","trialing","approval_pending","approved","past_due","suspended"].includes(subscriptionStatus)){
   return Response.json({error:"Ce compte a déjà un abonnement ou un paiement en cours. Consulte le prestataire de paiement."},{status:409});
  }
  if(profile?.plan==="pro"&&profile?.subscription_status==="active")return Response.json({error:"Un abonnement Pro est déjà actif sur ce compte"},{status:409});
  if(profile?.subscription_status==="payment_pending"&&profile?.updated_at&&Date.now()-new Date(profile.updated_at).getTime()<30*60*1000)return Response.json({error:"Un paiement est déjà en attente de confirmation"},{status:409});
  if(provider==="mollie"){
   let customerId=profile?.payment_provider==="mollie"?profile.provider_customer_id:null;
   if(!customerId){const customer=await createMollieCustomer({name:profile?.full_name||user.email,email:user.email});customerId=customer.id;await admin.from("profiles").update({payment_provider:"mollie",provider_customer_id:customerId}).eq("id",user.id)}
   const payment=await createFirstMolliePayment({customerId,amount:price.total,currency:price.currency,userId:user.id});
   await admin.from("profiles").update({payment_provider:"mollie",subscription_id:null,subscription_status:"payment_pending",updated_at:new Date().toISOString()}).eq("id",user.id);
   return Response.json({url:payment._links?.checkout?.href});
  }
  if(!process.env.PAYPAL_PLAN_ID)return Response.json({error:"Plan PayPal non configuré"},{status:503});
  const paypalPlan=await paypalCall("/v1/billing/plans/"+encodeURIComponent(process.env.PAYPAL_PLAN_ID));
  const regular=paypalPlan?.billing_cycles?.find(cycle=>cycle.tenure_type==="REGULAR");
  if(paypalPlan?.status!=="ACTIVE"||regular?.frequency?.interval_unit!=="MONTH"||
     regular.frequency.interval_count!==1||regular.total_cycles!==0||
     !Number.isInteger(regular.sequence)||!regular.pricing_scheme?.fixed_price||
     regular.pricing_scheme.fixed_price.currency_code!==price.currency){
   return Response.json({error:"Le plan mensuel PayPal n’est pas compatible avec le tarif TESAMI."},{status:503});
  }
  const plan={billing_cycles:[{sequence:regular.sequence,pricing_scheme:{fixed_price:{value:price.total,currency_code:price.currency}}}]};
  const sub=await paypalCall("/v1/billing/subscriptions",{method:"POST",body:JSON.stringify({plan_id:process.env.PAYPAL_PLAN_ID,plan,custom_id:user.id,subscriber:{email_address:user.email},application_context:{brand_name:"Networkly AI",user_action:"SUBSCRIBE_NOW",return_url:`${process.env.NEXT_PUBLIC_APP_URL}/billing/success`,cancel_url:`${process.env.NEXT_PUBLIC_APP_URL}/billing`}})});
  const approve=sub.links?.find(x=>x.rel==="approve")?.href;
  await admin.from("profiles").update({payment_provider:"paypal",subscription_id:sub.id,subscription_status:sub.status||"APPROVAL_PENDING"}).eq("id",user.id);
  return Response.json({url:approve});
 }catch(e){return Response.json({error:"Impossible de démarrer le paiement."},{status:500})}
}