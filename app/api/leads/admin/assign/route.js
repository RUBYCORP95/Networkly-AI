import {createServerSupabase} from "../../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../../lib/supabase/admin";
import {requireActiveUser} from "../../../../../lib/auth/active-user";
import {checkLeadAccess} from "../../../../../lib/leads/access";
export async function POST(req){
 const session=await createServerSupabase();const access=await requireActiveUser(session);
 if(!access.ok)return Response.json({error:access.error},{status:access.status});
 if(!access.profile?.is_admin)return Response.json({error:"Réservé à l'administrateur"},{status:403});
 let body;try{body=await req.json()}catch{return Response.json({error:"JSON invalide"},{status:400})}
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!uuid.test(String(body.organization_id||""))||!uuid.test(String(body.user_id||"")))return Response.json({error:"Identifiants invalides"},{status:400});
 const db=createAdminSupabase();
 const {data:recipient,error:recipientError}=await db.from("profiles").select("id,account_status").eq("id",body.user_id).single();
 if(recipientError||!recipient||recipient.account_status==="suspended")return Response.json({error:"Consultant indisponible"},{status:400});
 const {data:membership,error:membershipError}=await db.from("lead_team_memberships").select("status").eq("user_id",body.user_id).maybeSingle();
 if(membershipError)return Response.json({error:"Vérification de l’équipe indisponible"},{status:503});
 if(membership?.status!=="verified")return Response.json({error:"Attribution manuelle réservée aux membres Chogan vérifiés"},{status:403});
 const entitlement=await checkLeadAccess(body.user_id,false,db);
 if(!entitlement.allowed)return Response.json({error:"Le destinataire ne dispose pas d’un accès LeadFactory actif"},{status:403});
 const {data:blocked}=await db.from("lead_suppressions").select("id").eq("organization_id",body.organization_id).maybeSingle();
 if(blocked)return Response.json({error:"Entreprise exclue de la prospection"},{status:409});
 const {data:assignment,error}=await db.from("lead_assignments").insert({organization_id:body.organization_id,user_id:body.user_id}).select("id").single();
 if(error)return Response.json({error:error.code==="23505"?"Prospect déjà attribué":"Attribution impossible"},{status:error.code==="23505"?409:500});
 return Response.json({ok:true,assignment_id:assignment.id});
}
