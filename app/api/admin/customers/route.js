import {createServerSupabase} from "../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../lib/supabase/admin";
export async function GET(){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const {data:me}=await s.from("profiles").select("is_admin").eq("id",user.id).single();if(!me?.is_admin)return Response.json({error:"Accès administrateur requis"},{status:403});
 const admin=createAdminSupabase();const {data,error}=await admin.from("profiles").select("id,full_name,company,plan,payment_provider,subscription_status,payment_failed_at,grace_period_ends_at,last_payment_at,created_at").order("created_at",{ascending:false});if(error)return Response.json({error:error.message},{status:500});
 const profiles=data||[];
 const consultantStatuses=new Map();
 for(let start=0;start<profiles.length;start+=100){
  const ids=profiles.slice(start,start+100).map(profile=>profile.id);
  const {data:memberships,error:membershipError}=await admin.from("lead_team_memberships")
    .select("user_id,status").in("user_id",ids);
  if(membershipError)return Response.json({error:"Impossible de charger les statuts consultant."},{status:500});
  for(const member of memberships||[])consultantStatuses.set(member.user_id,member.status);
 }
 const users=[];for(const p of profiles){const {data:u}=await admin.auth.admin.getUserById(p.id);const days=p.grace_period_ends_at?Math.max(0,Math.ceil((new Date(p.grace_period_ends_at)-Date.now())/86400000)):null;users.push({...p,consultant_status:consultantStatuses.get(p.id)??null,email:u?.user?.email||"",days_remaining:days})}
 return Response.json({users});
}