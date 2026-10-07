import {createServerSupabase} from "../../../../lib/supabase/server";
import {tiktokCreatorInfo} from "../../../../lib/social/tiktok";
export async function GET(){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const {data:c}=await s.from("social_connections").select("*").eq("user_id",user.id).eq("provider","tiktok").eq("connected",true).limit(1).maybeSingle();if(!c)return Response.json({connected:false,privacy:[]});
 try{const info=await tiktokCreatorInfo(c);return Response.json({connected:true,privacy:info.privacy_level_options||[],creator:{nickname:info.creator_nickname||c.account_name||"TikTok",avatar:info.creator_avatar_url||null},features:{comment:!info.comment_disabled,duet:!info.duet_disabled,stitch:!info.stitch_disabled}})}catch(e){return Response.json({connected:true,privacy:[],error:e.message},{status:400})}
}