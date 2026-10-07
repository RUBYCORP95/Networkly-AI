import {decryptToken} from "./tokens";
const BASE="https://open.tiktokapis.com";
async function call(path,token,body){
 const r=await fetch(BASE+path,{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json; charset=UTF-8"},body:JSON.stringify(body||{})});const j=await r.json();if(!r.ok||j.error?.code!=="ok")throw new Error(j.error?.message||j.error?.code||"Erreur TikTok");return j.data;
}
export async function tiktokCreatorInfo(connection){return call("/v2/post/publish/creator_info/query/",decryptToken(connection.access_token_encrypted),{})}
export async function tiktokInitVideo(connection,{caption,privacy,isAiGenerated,size,disableComment=false,disableDuet=false,disableStitch=false}){
 const token=decryptToken(connection.access_token_encrypted);const data=await call("/v2/post/publish/video/init/",token,{post_info:{title:caption||"",privacy_level:privacy,disable_duet:!!disableDuet,disable_comment:!!disableComment,disable_stitch:!!disableStitch,is_aigc:!!isAiGenerated},source_info:{source:"FILE_UPLOAD",video_size:size,chunk_size:size,total_chunk_count:1}});return {...data,token};
}
export async function tiktokUploadVideo(uploadUrl,bytes,type){
 const r=await fetch(uploadUrl,{method:"PUT",headers:{"Content-Type":type,"Content-Length":String(bytes.byteLength),"Content-Range":"bytes 0-"+(bytes.byteLength-1)+"/"+bytes.byteLength},body:bytes});if(!r.ok)throw new Error("Envoi vidéo TikTok impossible");
}
export async function tiktokStatus(connection,publishId){return call("/v2/post/publish/status/fetch/",decryptToken(connection.access_token_encrypted),{publish_id:publishId})}
