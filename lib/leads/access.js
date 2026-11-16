import {createAdminSupabase} from "../supabase/admin";
// Server-side entitlement. Team verification is independent from TESAMI billing.
export async function checkLeadAccess(userId,isAdmin=false,db=createAdminSupabase()){
 const {data:profile,error:profileError}=await db.from("profiles").select("plan,subscription_status,account_status,is_admin").eq("id",userId).single();
 if(profileError)return {allowed:false,reason:"account_unavailable",status:503};
 if(profile.account_status==="suspended")return {allowed:false,reason:"suspended",status:403};
 if(isAdmin&&profile.is_admin)return {allowed:true,reason:"admin"};
 const {data:membership,error:membershipError}=await db.from("lead_team_memberships").select("status").eq("user_id",userId).maybeSingle();
 if(membershipError)return {allowed:false,reason:"membership_unavailable",status:503};
 if(membership?.status==="verified")return {allowed:true,reason:"chogan_team"};
 if(["active","trialing"].includes(profile.subscription_status)&&profile.plan&&!["free","gratuit"].includes(String(profile.plan).toLowerCase()))return {allowed:true,reason:"subscription"};
 return {allowed:false,reason:"verification_required",status:403};
}
export async function requireLeadAccess(access){
 if(!access.ok)return {ok:false,status:access.status,error:access.error};
 const entitlement=await checkLeadAccess(access.user.id,Boolean(access.profile?.is_admin));
 if(!entitlement.allowed)return {ok:false,status:entitlement.status||403,error:entitlement.reason==="verification_required"?"Accès LeadFactory réservé aux membres Chogan vérifiés ou abonnés éligibles.": "Vérification de l'accès LeadFactory indisponible."};
 return {ok:true,reason:entitlement.reason};
}
