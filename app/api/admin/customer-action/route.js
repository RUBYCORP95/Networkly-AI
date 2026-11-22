import {createServerSupabase} from "../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../lib/supabase/admin";
async function context(){const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return null;const {data:p}=await s.from("profiles").select("is_admin,account_status").eq("id",user.id).single();if(p?.is_admin!==true||p.account_status==="suspended")return null;return {user,admin:createAdminSupabase()}}
async function confirmCustomerEmail({user,admin}, {customerId,expectedEmail}) {
 const {data:profile,error:profileError}=await admin.from("profiles").select("is_admin,account_status").eq("id",customerId).maybeSingle();
 if(profileError)return Response.json({error:"Impossible de charger le profil client."},{status:502});
 if(!profile)return Response.json({error:"Client introuvable."},{status:404});
 if(profile.is_admin||profile.account_status==="suspended")return Response.json({error:"La validation manuelle est réservée aux comptes clients actifs."},{status:409});

 const {data,error}=await admin.auth.admin.getUserById(customerId);
 if(error||!data?.user)return Response.json({error:"Impossible de charger le compte client."},{status:502});
 const customer=data.user;
 if(!customer.email||customer.email!==expectedEmail)return Response.json({error:"L’adresse e-mail a changé. Actualise la fiche client."},{status:409});
 if(customer.email_confirmed_at)return Response.json({ok:true,emailConfirmedAt:customer.email_confirmed_at});

 const {data:audit,error:auditError}=await admin.from("admin_audit_log").insert({
  admin_id:user.id,customer_id:customerId,action:"confirm_email",details:{status:"pending"}
 }).select("id").single();
 if(auditError||!audit)return Response.json({error:"Impossible de journaliser la validation."},{status:502});

 const {data:updated,error:updateError}=await admin.auth.admin.updateUserById(customerId,{email_confirm:true});
 const emailConfirmedAt=updated?.user?.email_confirmed_at;
 const confirmed=!updateError&&!!emailConfirmedAt&&updated.user.email===expectedEmail;
 const {error:logError}=await admin.from("admin_audit_log").update({
  details:confirmed?{status:"confirmed",confirmed_at:emailConfirmedAt}:{status:"failed"}
 }).eq("id",audit.id);
 if(logError)console.error("Impossible de finaliser le journal de validation de l’e-mail.",audit.id);
 if(!confirmed)return Response.json({error:"Impossible de confirmer l’adresse e-mail. Actualise la fiche et réessaie."},{status:502});
 return Response.json({ok:true,emailConfirmedAt});
}

export async function POST(req){
 const ctx=await context();if(!ctx)return Response.json({error:"Accès administrateur requis"},{status:403});const b=await req.json();if(!b.customerId)return Response.json({error:"Client requis"},{status:400});
 if(b.action==="confirm_email"){
  if(req.headers.get("content-type")?.split(";")[0]!=="application/json"||typeof b.expectedEmail!=="string"||!b.expectedEmail)
   return Response.json({error:"Adresse e-mail à confirmer requise."},{status:400});
  return confirmCustomerEmail(ctx,b);
 }
 if(b.action==="note"){if(!String(b.note||"").trim())return Response.json({error:"Note vide"},{status:400});await ctx.admin.from("admin_customer_notes").insert({customer_id:b.customerId,admin_id:ctx.user.id,note:String(b.note).trim()});}
 else {const patch=b.action==="suspend"?{account_status:"suspended"}:b.action==="restore"?{account_status:"active"}:b.action==="grant_pro"?{plan:"pro",subscription_status:"manual_pro"}:null;if(!patch)return Response.json({error:"Action invalide"},{status:400});const {error}=await ctx.admin.from("profiles").update({...patch,updated_at:new Date().toISOString()}).eq("id",b.customerId);if(error)return Response.json({error:error.message},{status:400});}
 await ctx.admin.from("admin_audit_log").insert({admin_id:ctx.user.id,customer_id:b.customerId,action:b.action,details:b.action==="note"?{note:String(b.note).slice(0,200)}:{}});
 return Response.json({ok:true});
}