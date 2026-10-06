import {createServerSupabase} from "../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../lib/supabase/admin";
async function context(){const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return null;const {data:p}=await s.from("profiles").select("is_admin").eq("id",user.id).single();if(!p?.is_admin)return null;return {user,admin:createAdminSupabase()}}
export async function POST(req){
 const ctx=await context();if(!ctx)return Response.json({error:"Accès administrateur requis"},{status:403});const b=await req.json();if(!b.customerId)return Response.json({error:"Client requis"},{status:400});
 if(b.action==="note"){if(!String(b.note||"").trim())return Response.json({error:"Note vide"},{status:400});await ctx.admin.from("admin_customer_notes").insert({customer_id:b.customerId,admin_id:ctx.user.id,note:String(b.note).trim()});}
 else {const patch=b.action==="suspend"?{account_status:"suspended"}:b.action==="restore"?{account_status:"active"}:b.action==="grant_pro"?{plan:"pro",subscription_status:"manual_pro"}:null;if(!patch)return Response.json({error:"Action invalide"},{status:400});const {error}=await ctx.admin.from("profiles").update({...patch,updated_at:new Date().toISOString()}).eq("id",b.customerId);if(error)return Response.json({error:error.message},{status:400});}
 await ctx.admin.from("admin_audit_log").insert({admin_id:ctx.user.id,customer_id:b.customerId,action:b.action,details:b.action==="note"?{note:String(b.note).slice(0,200)}:{}});
 return Response.json({ok:true});
}