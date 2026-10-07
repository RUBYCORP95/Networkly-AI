import {decryptToken} from "./tokens";
import {metaPages,facebookPhoto,facebookVideo,instagramCreate,instagramPublish,waitForInstagramContainer,instagramMediaDetails} from "./meta";
import {tiktokCreatorInfo,tiktokInitVideo,tiktokUploadVideo} from "./tiktok";
export async function publishTarget({db,target,content,connection,mediaUrl,mediaBytes,mediaType}){
 const provider=target.provider,caption=content.body||"";
 if(provider==="facebook"){
  const pages=await metaPages(connection);const page=(pages.data||[]).find(p=>p.id===connection.selected_page_id)||(pages.data||[])[0];if(!page)throw new Error("Aucune Page Facebook autorisée");
  const result=mediaType.startsWith("video/")?await facebookVideo({pageId:page.id,pageToken:page.access_token,videoUrl:mediaUrl,caption}):await facebookPhoto({pageId:page.id,pageToken:page.access_token,imageUrl:mediaUrl,caption});return {id:result.id||result.post_id};
 }
 if(provider==="instagram"){
  const pages=await metaPages(connection);const page=(pages.data||[]).find(p=>p.instagram_business_account?.id===connection.selected_ig_user_id)||(pages.data||[]).find(p=>p.instagram_business_account);if(!page?.instagram_business_account)throw new Error("Aucun compte Instagram professionnel autorisé");
  const container=await instagramCreate({igUserId:page.instagram_business_account.id,pageToken:page.access_token,mediaUrl,caption,isVideo:mediaType.startsWith("video/")});if(mediaType.startsWith("video/"))await waitForInstagramContainer({creationId:container.id,pageToken:page.access_token});const result=await instagramPublish({igUserId:page.instagram_business_account.id,pageToken:page.access_token,creationId:container.id});if(!result?.id)throw new Error("Instagram n’a pas confirmé la publication");let verified=null;for(let i=0;i<6;i++){try{verified=await instagramMediaDetails({mediaId:result.id,pageToken:page.access_token});if(verified?.id)break}catch(e){if(i===5)throw e;await new Promise(r=>setTimeout(r,2000))}}if(!verified?.id)throw new Error("Instagram a accepté la publication mais le média n’est pas encore disponible.");return {id:verified.id,permalink:verified.permalink||null,username:verified.username||page.instagram_business_account.username||null};
 }
 if(provider==="tiktok"){
  if(!mediaType.startsWith("video/"))throw new Error("Publication photo TikTok à configurer");
  const info=await tiktokCreatorInfo(connection);const {data:settings}=await db.from("user_publish_settings").select("tiktok_privacy,tiktok_disable_comment,tiktok_disable_duet,tiktok_disable_stitch").eq("user_id",target.user_id).maybeSingle();const privacy=settings?.tiktok_privacy;if(!privacy)throw new Error("Choisis la confidentialité TikTok dans les réglages avant la publication");if(!(info.privacy_level_options||[]).includes(privacy))throw new Error("La confidentialité TikTok choisie n’est plus disponible");
  const init=await tiktokInitVideo(connection,{caption,privacy,isAiGenerated:content.is_ai_generated,size:mediaBytes.byteLength,disableComment:settings?.tiktok_disable_comment,disableDuet:settings?.tiktok_disable_duet,disableStitch:settings?.tiktok_disable_stitch});await tiktokUploadVideo(init.upload_url,mediaBytes,mediaType);return {id:init.publish_id};
 }
 throw new Error("Réseau non pris en charge");
}
