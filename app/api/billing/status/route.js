import {createServerSupabase} from "../../../../lib/supabase/server";
export async function GET(){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const {data:p,error}=await s.from("profiles").select("plan,payment_provider,subscription_status,payment_failed_at,grace_period_ends_at,last_payment_at,updated_at").eq("id",user.id).single();if(error)return Response.json({error:error.message},{status:400});
 let daysRemaining=null;if(p.grace_period_ends_at){const ms=new Date(p.grace_period_ends_at)-Date.now();daysRemaining=Math.max(0,Math.ceil(ms/86400000))}
 const pendingExpired=p.subscription_status==="payment_pending"&&p.updated_at&&Date.now()-new Date(p.updated_at).getTime()>=30*60*1000;
 return Response.json({billing:{...p,subscription_status:pendingExpired?"payment_expired":p.subscription_status,days_remaining:daysRemaining}});
}