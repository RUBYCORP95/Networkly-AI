const BASE="https://alexya.ai";
function headers(){const key=process.env.ALEXYA_API_KEY;if(!key)throw new Error("ALEXYA_API_KEY manquante");return {Authorization:"Bearer "+key,"Content-Type":"application/json"}}
async function call(path,options={}){const r=await fetch(BASE+path,{...options,headers:{...headers(),...(options.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.error?.message||data?.message||"Erreur Alexya");return data}
export function alexyaCredits(){return call("/api/v1/account/credits")}
export function generateAlexyaImage({prompt,aspectRatio="1:1",mode="fast"}){return call("/api/v1/image/generate",{method:"POST",body:JSON.stringify({prompt,mode,aspect_ratio:aspectRatio})})}
export function generateAlexyaVideo({prompt,aspectRatio="9:16",duration=5,resolution="720p",speed="turbo"}){return call("/api/v1/video/nova",{method:"POST",body:JSON.stringify({prompt,aspect_ratio:aspectRatio,duration,resolution,speed})})}
export async function pollAlexya(urlOrId){const path=String(urlOrId).startsWith("http")?String(urlOrId).replace(BASE,""):"/api/v1/generations/"+urlOrId;return call(path)}
