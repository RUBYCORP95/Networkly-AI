import {createServerSupabase} from "../../../../../lib/supabase/server";
import {makeOAuthState} from "../../../../../lib/social/oauth-state";
const cfg={
 instagram:{auth:"https://www.facebook.com/v24.0/dialog/oauth",client:"META_APP_ID",scope:"instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights,pages_show_list,pages_read_engagement"},
 facebook:{auth:"https://www.facebook.com/v24.0/dialog/oauth",client:"META_APP_ID",scope:"pages_show_list,pages_manage_posts,pages_read_engagement,read_insights"},
 tiktok:{auth:"https://www.tiktok.com/v2/auth/authorize/",client:"TIKTOK_CLIENT_KEY",scope:"user.info.basic,video.publish"}
};
export async function GET(req,{params}){
 const {provider}=await params;const c=cfg[provider];if(!c)return new Response("Réseau inconnu",{status:404});
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.redirect(new URL("/login",req.url));
 const client=process.env[c.client];if(!client)return new Response("Connexion réseau non configurée",{status:503});
 const state=makeOAuthState(user.id,provider);
 const redirect=`${process.env.NEXT_PUBLIC_APP_URL}/api/social/callback/${provider}`;
 const q=new URLSearchParams({client_id:client,redirect_uri:redirect,response_type:"code",scope:c.scope,state});
 if(provider==="tiktok"){q.delete("client_id");q.set("client_key",client)}
 return Response.redirect(c.auth+"?"+q.toString());
}