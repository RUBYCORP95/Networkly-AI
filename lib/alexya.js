const BASE="https://alexya.ai";
function headers(){const key=process.env.ALEXYA_API_KEY;if(!key)throw new Error("ALEXYA_API_KEY manquante");return {Authorization:"Bearer "+key,"Content-Type":"application/json"}}
async function call(path,options={}){const url=/^https?:\/\//i.test(String(path))?String(path):BASE+path;const r=await fetch(url,{...options,headers:{...headers(),...(options.headers||{})},cache:"no-store"});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.error?.message||data?.message||"Erreur Alexya");return data}
export function alexyaCredits(){return call("/api/v1/account/credits")}
export function presignAlexyaUpload({kind,contentType,fileName}){return call("/api/v1/uploads/presign",{method:"POST",body:JSON.stringify({kind,content_type:contentType,file_name:fileName})})}
export function generateAlexyaImage({prompt,aspectRatio="1:1",mode="fast",imageUrls=[]}){return call("/api/v1/image/generate",{method:"POST",body:JSON.stringify({prompt,mode,aspect_ratio:aspectRatio,...(imageUrls.length?{image_urls:imageUrls}:{})})})}
export function generateAlexyaVideo({prompt,aspectRatio="9:16",duration=5,resolution="720p",speed="turbo",referenceImageUrls=[]}){return call("/api/v1/video/nova",{method:"POST",body:JSON.stringify({prompt,aspect_ratio:aspectRatio,duration,resolution,speed,...(referenceImageUrls.length?{reference_image_urls:referenceImageUrls}:{})})})}
export async function pollAlexya(urlOrId){const value=String(urlOrId||"");const target=/^https?:\/\//i.test(value)?value:"/api/v1/generations/"+encodeURIComponent(value);return call(target)}
