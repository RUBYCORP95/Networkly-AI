import {createServerSupabase} from "../../../../lib/supabase/server";
import {createAdminSupabase} from "../../../../lib/supabase/admin";
export async function GET(req){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const {data:me}=await s.from("profiles").select("is_admin").eq("id",user.id).single();if(!me?.is_admin)return Response.json({error:"Accès administrateur requis"},{status:403});
 const id=new URL(req.url).searchParams.get("id");if(!id)return Response.json({error:"Client requis"},{status:400});const admin=createAdminSupabase();
 const {data:profile,error}=await admin.from("profiles").select("*").eq("id",id).single();if(error||!profile)return Response.json({error:"Client introuvable"},{status:404});
 const a=await admin.auth.admin.getUserById(id);const {data:content}=await admin.from("content_items").select("id,title,platform,status,publish_status,scheduled_date,created_at").eq("user_id",id).order("created_at",{ascending:false}).limit(10);const {data:social}=await admin.from("social_connections").select("provider,account_name,connected,expires_at").eq("user_id",id);const {data:media}=await admin.from("media_library").select("size_bytes").eq("user_id",id);const {data:usage}=await admin.from("usage_monthly").select("month_key,generations").eq("user_id",id).order("month_key",{ascending:false}).limit(6);
 const storage=(media||[]).reduce((n,x)=>n+Number(x.size_bytes||0),0);
 return Response.json({customer:{...profile,email:a?.data?.user?.email||"",last_sign_in_at:a?.data?.user?.last_sign_in_at||null},stats:{storage_bytes:storage,media_count:(media||[]).length,social_connected:(social||[]).filter(x=>x.connected).length},social:social||[],content:content||[],usage:usage||[]});
}