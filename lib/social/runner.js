import {decryptToken} from "./tokens";
import {metaPages,facebookPhoto,facebookVideo,instagramCreate,instagramPublish} from "./meta";
import {tiktokCreatorInfo,tiktokInitVideo,tiktokUploadVideo} from "./tiktok";
export async function publishTarget({db,target,content,connection,mediaUrl,mediaBytes,mediaType}){
 const provider=target.provider,caption=content.body||"";
 if(provider==="facebook"){
  const pages=await metaPages(connection);const page=(pages.data||[]).find(p=>p.id===connection.selected_page_id)||(pages.data||[])[0];if(!page)throw new Error("Aucune Page Facebook autorisée");
  const result=mediaType.startsWith("video/")?await facebookVideo({pageId:page.id,pageToken:page.access_token,videoUrl:mediaUrl,caption}):await facebookPhoto({pageId:page.id,pageToken:page.access_token,imageUrl:mediaUrl,caption});return {id:result.id||result.post_id};
 }
 if(provider==="instagram"){
  const pages=await metaPages(connection);const page=(pages.data||[]).find(p=>p.instagram_business_account?.id===connection.selected_ig_user_id)||(pages.data||[]).find(p=>p.instagram_business_account);if(!page?.instagram_business_account)throw new Error("Aucun compte Instagram professionnel autorisé");
  const container=await instagramCreate({igUserId:page.instagram_business_account.id,pageToken:page.access_token,mediaUrl,caption,isVideo:mediaType.startsWith("video/")});const result=await instagramPublish({igUserId:page.instagram_business_account.id,pageToken:page.access_token,creationId:container.id});return {id:result.id};
 }
 if(provider==="tiktok"){
  if(!mediaType.startsWith("video/"))throw new Error("Publication photo TikTok à configurer");
  const info=await tiktokCreatorInfo(connection);const privacy=(info.privacy_level_options||[])[0];if(!privacy)throw new Error("Aucune confidentialité TikTok disponible");
  const init=await tiktokInitVideo(connection,{caption,privacy,isAiGenerated:content.is_ai_generated,size:mediaBytes.byteLength});await tiktokUploadVideo(init.upload_url,mediaBytes,mediaType);return {id:init.publish_id};
 }
 throw new Error("Réseau non pris en charge");
}
