import {createServerSupabase} from "../../../../lib/supabase/server";
import {presignAlexyaUpload} from "../../../../lib/alexya";
export async function POST(req){
 try{
  const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
  const b=await req.json();const contentType=String(b.contentType||"");const allowed=["image/jpeg","image/png","image/webp"];if(!allowed.includes(contentType))return Response.json({error:"Format accepté : JPG, PNG ou WebP."},{status:400});
  const kind=b.mediaKind==="video"?"nova_image":"image_input";
  const data=await presignAlexyaUpload({kind,contentType,fileName:String(b.fileName||"reference")});
  return Response.json({uploadUrl:data.upload_url,publicUrl:data.public_url,maxBytes:data.max_bytes});
 }catch(e){return Response.json({error:e.message||"Upload impossible"},{status:500})}
}