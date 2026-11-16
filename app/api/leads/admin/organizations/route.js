import {createServerSupabase} from "../../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../../lib/supabase/admin";
import {requireActiveUser} from "../../../../../lib/auth/active-user";
export async function GET(){
 const session=await createServerSupabase(),access=await requireActiveUser(session);
 if(!access.ok)return Response.json({error:access.error},{status:access.status});
 if(!access.profile?.is_admin)return Response.json({error:"Accès administrateur requis"},{status:403});
 const db=createAdminSupabase();
 const {data,error}=await db.from("lead_organizations").select("id,name,sector,city,website,email,phone,created_at,lead_assignments(id,user_id,assigned_at)").order("created_at",{ascending:false}).limit(200);
 if(error)return Response.json({error:"Chargement des prospects impossible"},{status:503});
 return Response.json({organizations:data||[]});
}
