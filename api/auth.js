export default {
  async fetch(request) {
    const headers={"cache-control":"no-store","content-type":"application/json"};
    if(request.method!=="POST"){
      return new Response(JSON.stringify({error:"Method not allowed"}),{status:405,headers});
    }
    try{
      const body=await request.json().catch(()=>({}));
      if(!["signup","login"].includes(String(body?.action||""))){
        return new Response(JSON.stringify({error:"Acción de autenticación no válida"}),{status:400,headers});
      }
      const supabaseUrl=process.env.SUPABASE_URL||"";
      const supabaseKey=process.env.SUPABASE_PUBLISHABLE_KEY||"";
      if(!supabaseUrl||!supabaseKey){
        return new Response(JSON.stringify({error:"Configuración de autenticación incompleta"}),{status:500,headers});
      }
      const upstream=await fetch(supabaseUrl+"/functions/v1/account-auth",{
        method:"POST",
        headers:{
          "content-type":"application/json",
          "apikey":supabaseKey,
          "authorization":"Bearer "+supabaseKey
        },
        body:JSON.stringify(body)
      });
      const text=await upstream.text();
      let data={};
      try{data=JSON.parse(text)}catch{data={error:text||"Error de autenticación"}}
      return new Response(JSON.stringify(data),{status:upstream.status,headers});
    }catch(e){
      return new Response(JSON.stringify({error:e instanceof Error?e.message:"Error de autenticación"}),{status:500,headers});
    }
  }
};