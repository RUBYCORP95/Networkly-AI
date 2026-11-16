import {requireLeadAccess} from "../../../lib/leads/access";
import {requireActiveUser} from "../../../lib/auth/active-user";
import {createServerSupabase} from "../../../lib/supabase/server";
export async function GET(){
 const db=await createServerSupabase();
 const access=await requireActiveUser(db);
 if(!access.ok)return Response.json({error:access.error},{status:access.status});
 const entitlement=await requireLeadAccess(access);if(!entitlement.ok)return Response.json({error:entitlement.error},{status:entitlement.status});
 const user=access.user;
 const {data,error}=await db.from("lead_assignments").select("id,status,assigned_at,exclusive_until,lead_organizations(id,name,sector,city,address,website,email,phone,socials,source_url,verified_at)").eq("user_id",user.id).order("assigned_at",{ascending:false}).limit(100);
 if(error)return Response.json({error:"Le module LeadFactory nécessite sa migration Supabase."},{status:503});
 return Response.json({leads:data||[]});
}
