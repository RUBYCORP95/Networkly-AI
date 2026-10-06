import {createServerSupabase} from "../../../../lib/supabase/server";
import {encryptToken} from "../../../../lib/social/tokens";
import {metaPages} from "../../../../lib/social/meta";
export async function POST(req){
 try{
  const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const {pageId,igUserId}=await req.json();const {data:c}=await s.from("social_connections").select("*").eq("user_id",user.id).in("provider",["facebook","instagram"]).eq("connected",true).limit(1).maybeSingle();if(!c)throw new Error("Meta non connecté");
  const pages=await metaPages(c);const page=(pages.data||[]).find(x=>x.id===pageId);if(!page)throw new Error("Page non autorisée");
  const patch={selected_page_id:page.id,selected_ig_user_id:igUserId||page.instagram_business_account?.id||null,page_access_token_encrypted:encryptToken(page.access_token),updated_at:new Date().toISOString()};
  const {error}=await s.from("social_connections").update(patch).eq("user_id",user.id).in("provider",["facebook","instagram"]);if(error)throw error;
  return Response.json({ok:true,page:{id:page.id,name:page.name,instagram:page.instagram_business_account||null}});
 }catch(e){return Response.json({error:e.message},{status:400})}
}