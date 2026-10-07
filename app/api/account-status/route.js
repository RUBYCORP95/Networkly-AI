import {createServerSupabase} from "../../../lib/supabase/server";
export async function GET(){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({status:"anonymous"},{status:401});
 const {data:p}=await s.from("profiles").select("account_status,is_admin,subscription_status,plan").eq("id",user.id).single();
 return Response.json({status:p?.account_status||"active",isAdmin:!!p?.is_admin,subscriptionStatus:p?.subscription_status||"inactive",plan:p?.plan||"free",email:user.email||""});
}