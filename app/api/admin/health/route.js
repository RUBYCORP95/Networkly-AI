import {createServerSupabase} from "../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../lib/supabase/admin";
export async function GET(){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const {data:p}=await s.from("profiles").select("is_admin").eq("id",user.id).single();if(!p?.is_admin)return Response.json({error:"Accès administrateur requis"},{status:403});
 const a=createAdminSupabase();const checks=[];
 async function table(name){const {error}=await a.from(name).select("*",{head:true,count:"exact"}).limit(1);checks.push({name:"Table "+name,ok:!error,detail:error?.message||"OK"})}
 async function columns(name,cols){const {error}=await a.from(name).select(cols).limit(1);checks.push({name:name+" · "+cols,ok:!error,detail:error?.message||"OK"})}
 await table("profiles");await columns("profiles","account_status,is_admin,onboarding_completed,onboarding_step,payment_failed_at,grace_period_ends_at");
 await table("content_items");await columns("content_items","scheduled_at,schedule_timezone,target_networks,publish_mode,is_ai_generated");
 await table("publish_targets");await table("social_connections");await table("media_library");await table("ai_media_jobs");await table("billing_events");await table("admin_customer_notes");await table("admin_audit_log");
 return Response.json({ok:checks.every(x=>x.ok),checks});
}