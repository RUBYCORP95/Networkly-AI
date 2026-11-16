import {requireActiveUser} from "../../../../../lib/auth/active-user";
import {createServerSupabase} from "../../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../../lib/supabase/admin";
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
async function admin(){const session=await createServerSupabase(),access=await requireActiveUser(session);return access}
export async function GET(){
 const access=await admin();if(!access.ok)return Response.json({error:access.error},{status:access.status});
 if(!access.profile?.is_admin)return Response.json({error:"Accès administrateur requis"},{status:403});
 const db=createAdminSupabase();
 const {data,error}=await db.from("lead_team_memberships").select("user_id,consultant_identifier,status,created_at,verified_at").order("created_at",{ascending:false}).limit(200);
 if(error)return Response.json({error:"Migration LeadFactory équipe requise"},{status:503});
 return Response.json({members:data||[]});
}
export async function PATCH(req){
 const access=await admin();if(!access.ok)return Response.json({error:access.error},{status:access.status});
 if(!access.profile?.is_admin)return Response.json({error:"Accès administrateur requis"},{status:403});
 let body;try{body=await req.json()}catch{return Response.json({error:"JSON invalide"},{status:400})}
 if(!uuid.test(String(body.user_id||""))||!["verified","rejected","revoked","pending"].includes(body.status))return Response.json({error:"Paramètres invalides"},{status:400});
 const db=createAdminSupabase();
 const {data:current,error:readError}=await db.from("lead_team_memberships").select("user_id").eq("user_id",body.user_id).maybeSingle();
 if(readError||!current)return Response.json({error:"Demande introuvable"},{status:404});
 const approved=body.status==="verified";
 const {error}=await db.from("lead_team_memberships").update({status:body.status,verified_at:approved?new Date().toISOString():null,verified_by:approved?access.user.id:null,updated_at:new Date().toISOString()}).eq("user_id",body.user_id);
 if(error)return Response.json({error:"Mise à jour impossible"},{status:500});
 return Response.json({ok:true,status:body.status});
}
