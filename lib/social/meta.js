import {decryptToken} from "./tokens";
const GRAPH="https://graph.facebook.com/v24.0";
async function graph(path,{token,method="GET",body}={}){const opts={method,headers:{Authorization:"Bearer "+token}};if(body){opts.headers["Content-Type"]="application/json";opts.body=JSON.stringify(body)}const r=await fetch(GRAPH+path,opts);const j=await r.json();if(!r.ok||j.error)throw new Error(j.error?.message||"Erreur Meta");return j}
export async function metaPages(connection){const token=decryptToken(connection.access_token_encrypted);return graph("/me/accounts?fields=id,name,picture{url},access_token,instagram_business_account{id,username,profile_picture_url}",{token})}
export async function facebookPhoto({pageId,pageToken,imageUrl,caption}){return graph("/"+pageId+"/photos",{token:pageToken,method:"POST",body:{url:imageUrl,caption:caption||"",published:true}})}
export async function facebookVideo({pageId,pageToken,videoUrl,caption}){return graph("/"+pageId+"/videos",{token:pageToken,method:"POST",body:{file_url:videoUrl,description:caption||""}})}
export async function instagramCreate({igUserId,pageToken,mediaUrl,caption,isVideo=false}){const body={caption:caption||""};if(isVideo){body.media_type="REELS";body.video_url=mediaUrl}else body.image_url=mediaUrl;return graph("/"+igUserId+"/media",{token:pageToken,method:"POST",body})}
export async function instagramPublish({igUserId,pageToken,creationId}){return graph("/"+igUserId+"/media_publish",{token:pageToken,method:"POST",body:{creation_id:creationId}})}

export async function instagramContainerStatus({creationId,pageToken}){return graph("/"+creationId+"?fields=status_code,status",{token:pageToken})}
export async function waitForInstagramContainer({creationId,pageToken,maxAttempts=20}){for(let i=0;i<maxAttempts;i++){const s=await instagramContainerStatus({creationId,pageToken});if(s.status_code==="FINISHED")return s;if(["ERROR","EXPIRED"].includes(s.status_code))throw new Error("Traitement Instagram impossible");await new Promise(r=>setTimeout(r,3000))}throw new Error("Instagram traite encore la vidéo, nouvel essai nécessaire")}

export async function instagramMediaDetails({mediaId,pageToken}){return graph("/"+mediaId+"?fields=id,permalink,username,media_type,timestamp",{token:pageToken})}
