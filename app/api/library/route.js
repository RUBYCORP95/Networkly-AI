import {createServerSupabase} from "../../../lib/supabase/server";
export async function GET(){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const {data,error}=await s.from("media_library").select("*").order("created_at",{ascending:false});if(error)return Response.json({error:error.message},{status:500});
 const items=await Promise.all((data||[]).map(async x=>{const {data:signed}=await s.storage.from("content-media").createSignedUrl(x.media_path,3600);return {...x,url:signed?.signedUrl||null}}));
 return Response.json({items});
}
export async function POST(req){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const form=await req.formData();const file=form.get("file");if(!file||typeof file==="string")return Response.json({error:"Fichier requis"},{status:400});
 const allowed=["image/jpeg","image/png","image/webp","video/mp4","video/quicktime","video/webm"];if(!allowed.includes(file.type))return Response.json({error:"Format non accepté"},{status:415});
 const max=file.type.startsWith("video/")?1024*1024*1024:25*1024*1024;if(file.size>max)return Response.json({error:file.type.startsWith("video/")?"Vidéo limitée à 1 Go":"Image limitée à 25 Mo"},{status:413});
 const ext=(file.name.split(".").pop()||"bin").replace(/[^a-z0-9]/gi,"");const path=`${user.id}/library/${Date.now()}-${crypto.randomUUID()}.${ext}`;
 const {error:up}=await s.storage.from("content-media").upload(path,file,{contentType:file.type,upsert:false});if(up)return Response.json({error:up.message},{status:500});
 const {data,error}=await s.from("media_library").insert({user_id:user.id,source:"imported",media_path:path,media_type:file.type,original_name:file.name,title:String(form.get("title")||file.name),size_bytes:file.size}).select().single();
 if(error){await s.storage.from("content-media").remove([path]);return Response.json({error:error.message},{status:500})}
 return Response.json({item:data});
}
export async function DELETE(req){
 const s=await createServerSupabase();const {data:{user}}=await s.auth.getUser();if(!user)return Response.json({error:"Connexion requise"},{status:401});
 const id=new URL(req.url).searchParams.get("id");const {data:item}=await s.from("media_library").select("*").eq("id",id).eq("user_id",user.id).single();if(!item)return Response.json({error:"Introuvable"},{status:404});
 const {count}=await s.from("content_items").select("id",{count:"exact",head:true}).eq("user_id",user.id).eq("media_path",item.media_path).eq("status","planned");if(count>0)return Response.json({error:"Ce média est utilisé par une publication programmée. Supprime ou modifie d’abord cette publication."},{status:409});
 await s.storage.from("content-media").remove([item.media_path]);await s.from("media_library").delete().eq("id",id).eq("user_id",user.id);return Response.json({ok:true});
}