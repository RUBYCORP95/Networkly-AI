export async function requireActiveUser(supabase){
 const {data:{user}}=await supabase.auth.getUser();
 if(!user)return {ok:false,status:401,error:"Connexion requise"};
 const {data:profile,error}=await supabase.from("profiles").select("account_status,is_admin").eq("id",user.id).single();
 if(error)return {ok:false,status:403,error:"Compte inaccessible"};
 if(profile?.account_status==="suspended"&&!profile?.is_admin)return {ok:false,status:403,error:"Compte suspendu"};
 return {ok:true,user,profile};
}
