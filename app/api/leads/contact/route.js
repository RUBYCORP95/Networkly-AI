import {requireActiveUser} from "../../../../lib/auth/active-user";
import {requireLeadAccess} from "../../../../lib/leads/access";
import {createServerSupabase} from "../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../lib/supabase/admin";

const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(req){
 const session=await createServerSupabase();
 const access=await requireActiveUser(session);
 if(!access.ok)return Response.json({error:access.error},{status:access.status});
 const entitlement=await requireLeadAccess(access);
 if(!entitlement.ok)return Response.json({error:entitlement.error},{status:entitlement.status});
 let body;try{body=await req.json()}catch{return Response.json({error:"JSON invalide"},{status:400})}
 if(!uuid.test(String(body.assignment_id||"")))return Response.json({error:"Identifiant de prospect invalide"},{status:400});
 const db=createAdminSupabase();
 // The RPC atomically verifies ownership and the 48-hour deadline.
 const {data:allowed,error:claimError}=await db.rpc("reveal_assigned_lead_contact",{p_assignment_id:body.assignment_id,p_user_id:access.user.id});
 if(claimError)return Response.json({error:"Déverrouillage impossible"},{status:503});
 if(!allowed)return Response.json({error:"Ce prospect n'est plus disponible. Actualise ta liste."},{status:410});
 const {data:assignment,error}=await db.from("lead_assignments")
  .select("id,revealed_at,lead_organizations(email,phone,socials)")
  .eq("id",body.assignment_id).eq("user_id",access.user.id).single();
 if(error||!assignment)return Response.json({error:"Coordonnées indisponibles"},{status:503});
 return Response.json({ok:true,revealed_at:assignment.revealed_at,contact:assignment.lead_organizations||{}},
  {headers:{"Cache-Control":"no-store"}});
}
