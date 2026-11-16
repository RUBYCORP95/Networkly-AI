import {requireActiveUser} from "../../../../lib/auth/active-user";
import {createServerSupabase} from "../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../lib/supabase/admin";
export async function GET(){
 const session=await createServerSupabase(),access=await requireActiveUser(session);
 if(!access.ok)return Response.json({error:access.error},{status:access.status});
 const db=createAdminSupabase();
 const {data,error}=await db.from("lead_team_memberships").select("consultant_identifier,status,verified_at").eq("user_id",access.user.id).maybeSingle();
 if(error)return Response.json({error:"Migration LeadFactory équipe requise"},{status:503});
 return Response.json({membership:data||null,free_access:data?.status==="verified"});
}
export async function POST(req){
 const session=await createServerSupabase(),access=await requireActiveUser(session);
 if(!access.ok)return Response.json({error:access.error},{status:access.status});
 let body;try{body=await req.json()}catch{return Response.json({error:"JSON invalide"},{status:400})}
 const consultant_identifier=String(body.consultant_identifier||"").trim();
 if(!/^[a-zA-Z0-9 _-]{3,80}$/.test(consultant_identifier))return Response.json({error:"Identifiant consultant invalide (3 à 80 caractères)"},{status:400});
 const db=createAdminSupabase();
 const {data:existing,error:readError}=await db.from("lead_team_memberships").select("status").eq("user_id",access.user.id).maybeSingle();
 if(readError)return Response.json({error:"Vérification indisponible"},{status:503});
 if(existing?.status==="verified")return Response.json({error:"Compte déjà vérifié : contactez l'administrateur pour une modification"},{status:409});
 const {error}=await db.from("lead_team_memberships").upsert({user_id:access.user.id,consultant_identifier,status:"pending",verified_at:null,verified_by:null,updated_at:new Date().toISOString()},{onConflict:"user_id"});
 if(error)return Response.json({error:"Demande non enregistrée"},{status:500});
 return Response.json({ok:true,status:"pending"});
}
