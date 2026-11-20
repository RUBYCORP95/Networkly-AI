import {createSign} from "node:crypto";

export const runtime = "nodejs";
const origin = "https://parfum-inspiration.com";
const headers = { "Access-Control-Allow-Origin": origin };

function base64url(obj) { return Buffer.from(JSON.stringify(obj)).toString("base64url"); }
async function accessToken(){const email=process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;const key=process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g,"\n");if(!email||!key)throw Error("Identifiants Google Sheets non configurés");const now=Math.floor(Date.now()/1000);const header=base64url({alg:"RS256",typ:"JWT"});const payload=base64url({iss:email,scope:"https://www.googleapis.com/auth/spreadsheets.readonly",aud:"https://oauth2.googleapis.com/token",iat:now,exp:now+3600});const data=header+"."+payload;const signer=createSign("RSA-SHA256");signer.update(data);signer.end();const assertion=data+"."+signer.sign(key).toString("base64url");const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",assertion}),cache:"no-store"});if(!r.ok)throw Error("Authentification Google Sheets impossible");return (await r.json()).access_token}

export async function GET() {
  const spreadsheet = process.env.CONSULTANTS_SECTEURS_SHEET_ID;
  if (!spreadsheet) return Response.json({error:"Annuaire indisponible."}, {status:503, headers});

  try {
    const token = await accessToken();
    const range = encodeURIComponent("'Feuil1'!A:E");
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheet)}/values/${range}`,
      {headers:{Authorization:`Bearer ${token}`}, cache:"no-store"}
    );
    if (!response.ok) throw new Error("Lecture du tableau impossible");
    const {values = []} = await response.json();
    const rows = values.slice(1)
      .map(row => Array.from({length:5}, (_, index) => String(row[index] ?? "").trim()))
      .filter(([postal, city, phone, country]) => postal && city && /^[+()0-9 .-]{6,25}$/.test(phone) && country);
    return Response.json(rows, {headers:{...headers,"Cache-Control":"public, max-age=0, s-maxage=60"}});
  } catch {
    return Response.json({error:"Annuaire indisponible."}, {status:503, headers});
  }
}
