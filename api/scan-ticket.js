// Mint a short-lived TCGGraph scanning ticket. The paid API key stays on Vercel,
// while the authenticated browser can scan continuously over a WebSocket.
function answer(res, code, data) {
  res.setHeader("Cache-Control","no-store");
  return res.status(code).json(data);
}
export default async function handler(req,res) {
  if(req.method!=="POST") {
    res.setHeader("Allow","POST");
    return answer(res,405,{error:"Solo se permite POST."});
  }
  const bearer=/^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(String(req.headers.authorization||""));
  if(!bearer)return answer(res,401,{error:"Inicia sesión para utilizar el escáner."});
  const supabaseUrl=String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const supabaseKey=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY;
  if(!/^https:\/\//.test(supabaseUrl)||!supabaseKey)
    return answer(res,503,{error:"No se ha configurado la autenticación."});
  try {
    const user=await fetch(supabaseUrl+"/auth/v1/user",{
      headers:{apikey:supabaseKey,Authorization:"Bearer "+bearer[1]},
      signal:AbortSignal.timeout(8000)
    });
    if(!user.ok)return answer(res,401,{error:"La sesión ha caducado."});
    const session=await user.json();
    if(!session?.id)return answer(res,401,{error:"Sesión inválida."});
    // 503 intentionally means "not configured", so the browser uses the existing
    // Vercel vision provider without asking for or disclosing a credential.
    const apiKey=process.env.TCGGRAPH_KEY;
    if(!apiKey)return answer(res,503,{error:"Escaneo continuo especializado no configurado.",code:"NOT_CONFIGURED"});
    const ticketResponse=await fetch("https://api.tcggraph.com/v1/scan/tickets",{
      method:"POST",
      headers:{Authorization:"Bearer "+apiKey},
      signal:AbortSignal.timeout(10000)
    });
    if(!ticketResponse.ok){
      if(ticketResponse.status===402||ticketResponse.status===429)
        return answer(res,503,{error:"No hay créditos o hay un límite temporal de reconocimiento.",code:"PROVIDER_LIMIT"});
      return answer(res,502,{error:"El proveedor especializado no está disponible.",code:"PROVIDER_ERROR"});
    }
    const data=await ticketResponse.json();
    if(typeof data.ticket!=="string"||!data.ticket||data.ticket.length>2048)
      return answer(res,502,{error:"No se ha recibido un ticket válido."});
    return answer(res,200,{ticket:data.ticket,provider:"tcggraph"});
  }catch(e){
    console.warn("TCGGraph scanner ticket",e?.name||"unknown");
    return answer(res,502,{error:"No se ha podido iniciar el reconocimiento especializado."});
  }
}
