import {createServerSupabase} from "../../../../../lib/supabase/server";
import {encryptToken} from "../../../../../lib/social/tokens";
import {verifyOAuthState} from "../../../../../lib/social/oauth-state";
async function tiktok(code,redirect){
 const body=new URLSearchParams({client_key:process.env.TIKTOK_CLIENT_KEY,client_secret:process.env.TIKTOK_CLIENT_SECRET,code,grant_type:"authorization_code",redirect_uri:redirect});
 const r=await fetch("https://open.tiktokapis.com/v2/oauth/token/",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});const j=await r.json();if(!r.ok||j.error)throw new Error(j.error_description||j.error||"TikTok OAuth");return {access:j.access_token,refresh:j.refresh_token,expires:j.expires_in,refreshExpires:j.refresh_expires_in,id:j.open_id,scopes:(j.scope||"").split(",")};
}
async function meta(code,redirect){
 const q=new URLSearchParams({client_id:process.env.META_APP_ID,client_secret:process.env.META_APP_SECRET,redirect_uri:redirect,code});
 const r=await fetch("https://graph.facebook.com/v24.0/oauth/access_token?"+q);const j=await r.json();if(!r.ok||j.error)throw new Error(j.error?.message||"Meta OAuth");return {access:j.access_token,expires:j.expires_in,id:null,scopes:[]};
}
export async function GET(req,{params}){
 try{
  const {provider}=await params;const url=new URL(req.url);const code=url.searchParams.get("code");if(!code)return Response.redirect(new URL("/social?error=authorization",req.url));
  const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.redirect(new URL("/login",req.url));const state=url.searchParams.get("state");if(!verifyOAuthState(state,user.id,provider))throw new Error("OAuth state invalide");
  const redirect=process.env.NEXT_PUBLIC_APP_URL+"/api/social/callback/"+provider;const t=provider==="tiktok"?await tiktok(code,redirect):await meta(code,redirect);
  const now=Date.now();const row={user_id:user.id,provider,provider_user_id:t.id,open_id:t.id,access_token_encrypted:encryptToken(t.access),refresh_token_encrypted:encryptToken(t.refresh),token_expires_at:t.expires?new Date(now+t.expires*1000).toISOString():null,refresh_expires_at:t.refreshExpires?new Date(now+t.refreshExpires*1000).toISOString():null,scopes:t.scopes,connected:true,updated_at:new Date().toISOString()};
  const {error}=await s.from("social_connections").upsert(row,{onConflict:"user_id,provider,provider_user_id"});if(error)throw error;
  return Response.redirect(new URL("/social?connected="+provider,req.url));
 }catch(e){return Response.redirect(new URL("/social?error="+encodeURIComponent(e.message||"oauth"),req.url))}
}