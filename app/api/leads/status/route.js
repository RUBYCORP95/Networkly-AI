import {requireLeadAccess} from "../../../../lib/leads/access";
import {createServerSupabase} from "../../../../lib/supabase/server";
import {requireActiveUser} from "../../../../lib/auth/active-user";
const valid=new Set(["new","contacted","interested","converted","closed"]);
export async function PATCH(req){
 const db=await createServerSupabase();const access=await requireActiveUser(db);
 if(!access.ok)return Response.json({error:access.error},{status:access.status});
 const entitlement=await requireLeadAccess(access);if(!entitlement.ok)return Response.json({error:entitlement.error},{status:entitlement.status});
 let body;try{body=await req.json()}catch{return Response.json({error:"JSON invalide"},{status:400})}
 if(!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(String(body.id||""))||!valid.has(body.status))return Response.json({error:"Statut invalide"},{status:400});
 const {data,error}=await db.rpc("update_my_lead_status",{p_assignment_id:body.id,p_status:body.status});
 if(error)return Response.json({error:"Modification impossible"},{status:500});
 if(!data)return Response.json({error:"Prospect introuvable"},{status:404});
 return Response.json({ok:true});
}
