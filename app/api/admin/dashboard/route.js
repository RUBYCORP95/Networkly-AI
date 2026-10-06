import {createServerSupabase} from "../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../lib/supabase/admin";
export async function GET(){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});const {data:me}=await s.from("profiles").select("is_admin").eq("id",user.id).single();if(!me?.is_admin)return Response.json({error:"Accès administrateur requis"},{status:403});
 const admin=createAdminSupabase();const now=new Date(),start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1)).toISOString();
 const [{data:profiles},{data:settings},{data:payments}]=await Promise.all([admin.from("profiles").select("id,plan,subscription_status,created_at"),admin.from("app_settings").select("monthly_price,currency").eq("id","main").single(),admin.from("billing_events").select("amount,currency,status,created_at").gte("created_at",start)]);
 const p=profiles||[],price=Number(settings?.monthly_price||0),pro=p.filter(x=>x.plan==="pro"&&x.subscription_status!=="grace_expired").length,pastDue=p.filter(x=>x.subscription_status==="past_due").length,newUsers=p.filter(x=>new Date(x.created_at)>=new Date(start)).length;
 const paid=(payments||[]).filter(x=>["paid","completed","active","approved"].includes(String(x.status).toLowerCase()));const revenue=paid.reduce((n,x)=>n+Number(x.amount||0),0);
 return Response.json({stats:{users:p.length,pro,mrr:pro*price,past_due:pastDue,new_users:newUsers,revenue,currency:settings?.currency||"EUR"}});
}