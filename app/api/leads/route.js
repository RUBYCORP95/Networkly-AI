import {createServerSupabase} from "../../../lib/supabase/server";
export async function GET(){
 const db=await createServerSupabase();
 const {data:{user},error:authError}=await db.auth.getUser();
 if(authError||!user)return Response.json({error:"Non autorisé"},{status:401});
 const {data,error}=await db.from("lead_assignments").select("id,status,assigned_at,exclusive_until,lead_organizations(id,name,sector,city,address,website,email,phone,socials,source_url,verified_at)").eq("user_id",user.id).order("assigned_at",{ascending:false}).limit(100);
 if(error)return Response.json({error:"Le module LeadFactory nécessite sa migration Supabase."},{status:503});
 return Response.json({leads:data||[]});
}
