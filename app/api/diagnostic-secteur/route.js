import {createSign} from "node:crypto";
export const dynamic="force-dynamic";
export const runtime="nodejs";
function base64url(obj){return Buffer.from(JSON.stringify(obj)).toString("base64url")}
async function accessToken(){const email=process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;const key=process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g,"\n");if(!email||!key)throw Error("Identifiants Google Sheets non configurés");const now=Math.floor(Date.now()/1000);const header=base64url({alg:"RS256",typ:"JWT"});const payload=base64url({iss:email,scope:"https://www.googleapis.com/auth/spreadsheets",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600});const data=header+"."+payload;const signer=createSign("RSA-SHA256");signer.update(data);signer.end();const assertion=data+"."+signer.sign(key).toString("base64url");const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion}),cache:"no-store"});if(!r.ok)throw Error("Authentification Google Sheets impossible");return (await r.json()).access_token}
export async function GET() {
 if(process.env.VERCEL_ENV!=="preview" || process.env.VERCEL_GIT_COMMIT_REF!=="diagnostic/secteur-lecture") return new Response(null,{status:404});
 const identityMatches=process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL?.trim()==="tesami-leadfactory@tesami-515017.iam.gserviceaccount.com";
 let token;
 try {token=await accessToken();} catch {return Response.json({identityMatches,oauth:false});}
 try {
  const range=encodeURIComponent("'Feuil1'!A1");
  const r=await fetch("https://sheets.googleapis.com/v4/spreadsheets/1OTs83RcZWRUAnuPdImAKCG39WDal2gAWsP6sTfUzy3Y/values/"+range,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
  const data=r.ok?null:await r.json().catch(()=>null);
  const reason=data?.error?.details?.find(d=>typeof d.reason==="string")?.reason??data?.error?.errors?.[0]?.reason;
  return Response.json({identityMatches,oauth:true,status:r.status,reason:typeof reason==="string"&&/^[A-Za-z_]{1,80}$/.test(reason)?reason:null});
 } catch {return Response.json({identityMatches,oauth:true,unreachable:true});}
}
