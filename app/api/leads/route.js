import {requireLeadAccess} from "../../../lib/leads/access";
import {requireActiveUser} from "../../../lib/auth/active-user";
import {createServerSupabase} from "../../../lib/supabase/server";
import {createAdminSupabase} from "../../../lib/supabase/admin";

export async function GET(){
 const session=await createServerSupabase();
 const access=await requireActiveUser(session);
 if(!access.ok)return Response.json({error:access.error},{status:access.status});
 const entitlement=await requireLeadAccess(access);
 if(!entitlement.ok)return Response.json({error:entitlement.error},{status:entitlement.status});
 const db=createAdminSupabase();
 // Read only assignments belonging to the authenticated user; service role does
 // not expose contact details to the client before an explicit unlock.
 const {data,error}=await db.from("lead_assignments")
  .select("id,status,assigned_at,revealed_at,organization_id,lead_organizations(id,name,sector,city,address,website,email,phone,socials,source_url,verified_at)")
  .eq("user_id",access.user.id).order("assigned_at",{ascending:false}).limit(100);
 if(error)return Response.json({error:"Chargement des prospects impossible"},{status:503});
 const now=Date.now();
 const leads=(data||[]).filter(a=>a.revealed_at||now-new Date(a.assigned_at).getTime()<48*60*60*1000)
 .map(a=>{
  const org=a.lead_organizations||{};
  const revealed=Boolean(a.revealed_at);
  return {id:a.id,status:a.status,assigned_at:a.assigned_at,revealed_at:a.revealed_at,
   contact_deadline:new Date(new Date(a.assigned_at).getTime()+48*60*60*1000).toISOString(),
   lead_organizations:{id:org.id,name:org.name,sector:org.sector,city:org.city,
    address:org.address,website:org.website,
    email:revealed?org.email:null,phone:revealed?org.phone:null,
    socials:revealed?org.socials:{},source_url:org.source_url,verified_at:org.verified_at}};
 });
 return Response.json({leads},{headers:{"Cache-Control":"no-store"}});
}
