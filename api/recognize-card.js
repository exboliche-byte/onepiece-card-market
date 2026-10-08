// Vision recognition for signed-in MiAlbumOnePiece users.
// Uses Vercel AI Gateway OIDC (or server-side AI_GATEWAY_API_KEY); never expose tokens to the browser.
const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
const MODEL = "openai/gpt-4.1-mini";
const requests = new Map();
const systemPrompt = [
  "You identify physical ONE PIECE CARD GAME trading cards from photographs.",
  "Examine the ACTUAL image: printed card code, name, layout, color, illustration, and any parallel-art clues.",
  "Do not rely only on text. Do not assume the title or code suggested by OCR is true.",
  "If the card is upside-down, partially covered, poorly lit or too blurry, say uncertain.",
  "Never invent a card ID. Return code only when you can read it with reasonable certainty.",
  "Do not claim an exact parallel/reprint from a shared card code alone.",
  "Output ONLY a valid JSON object with keys code, name, confidence, variant_hint, art_description, readable_code.",
  "code: full printed code such as OP06-043 or P-078, or empty string; name: printed character/card title or empty;",
  "confidence: high / medium / low / none (high requires code legible and card convincingly identifiable);",
  "variant_hint: base / parallel / reprint / uncertain (uncertain unless printing clearly differentiable);",
  "art_description: brief visible illustration details, max 100 characters; readable_code: boolean.",
].join(" ");

function reply(res, code, obj) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  return res.status(code).json(obj);
}
function boundedString(v, max=90) { return typeof v === "string" ? v.slice(0,max).trim() : ""; }
export default async function handler(req,res) {
  if(req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return reply(res,405,{error:"Solo POST"});
  }
  const bearer = /^Bearer\s+([A-Za-z0-9._~-]+)$/i.exec(String(req.headers.authorization||""));
  if(!bearer) return reply(res,401,{error:"Inicia sesión para utilizar el reconocimiento con IA."});
  const url = String(process.env.SUPABASE_URL||"").replace(/\/$/,"");
  const key = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if(!/^https:\/\//.test(url)||!key) return reply(res,503,{error:"Autenticación no configurada."});
  try {
    const check=await fetch(url+"/auth/v1/user",{
      headers:{apikey:key,Authorization:"Bearer "+bearer[1]},
      signal:AbortSignal.timeout(8000)
    });
    if(!check.ok) return reply(res,401,{error:"Sesión caducada. Inicia sesión de nuevo."});
    const user=await check.json();
    if(!user?.id)return reply(res,401,{error:"Sesión no válida."});
    const now=Date.now();
    for(const [id,x] of requests)if(now-x.first>120000)requests.delete(id);
    const rate=requests.get(user.id)||{first:now,last:0,count:0};
    if(now-rate.first>60000){rate.first=now;rate.count=0}
    if(now-rate.last<4500||rate.count>=12)return reply(res,429,{error:"Demasiadas consultas de IA. Espera unos segundos."});
    rate.last=now;rate.count++;requests.set(user.id,rate);
    const img=req.body?.image;
    if(typeof img!=="string"||img.length>1000000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(img)||img.length<5000) {
      return reply(res,400,{error:"Imagen JPEG no válida o demasiado grande."});
    }
    const auth=process.env.AI_GATEWAY_API_KEY||process.env.VERCEL_OIDC_TOKEN;
    if(!auth)return reply(res,503,{error:"El reconocimiento con IA aún no está habilitado en este entorno."});
    const hint=boundedString(req.body?.ocrHint,110).replace(/[\r\n]/g," ");
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),22000);
    let response;
    try{
      response=await fetch(GATEWAY,{
        method:"POST",
        headers:{"Content-Type":"application/json",Authorization:"Bearer "+auth},
        signal:controller.signal,
        body:JSON.stringify({
          model:MODEL,temperature:0,max_tokens:220,stream:false,
          response_format:{type:"json_object"},
          messages:[
            {role:"system",content:systemPrompt},
            {role:"user",content:[
              {type:"text",text:"Identify the photographed physical trading card. OCR hint (may be incorrect): "+(hint||"none")+". Return the specified JSON fields. If not sure, return low/none confidence and empty code."},
              {type:"image_url",image_url:{url:img,detail:"high"}}
            ]}
          ]
        })
      });
    }finally{clearTimeout(timeout)}
    if(!response.ok){
      if(response.status===402||response.status===429)return reply(res,503,{error:"El servicio de IA no tiene cuota disponible ahora mismo."});
      if(response.status===401||response.status===403)return reply(res,503,{error:"El servicio de IA necesita autorización en Vercel."});
      return reply(res,502,{error:"El servicio de visión no pudo analizar la imagen."});
    }
    const payload=await response.json();
    const raw=payload?.choices?.[0]?.message?.content;
    const txt=typeof raw==="string"?raw:(Array.isArray(raw)?raw.map(x=>x.text||"").join(""):"");
    let data;try{data=JSON.parse(txt)}catch{return reply(res,502,{error:"La IA devolvió una respuesta ilegible."})}
    const confidence=["high","medium","low","none"].includes(data.confidence)?data.confidence:"low";
    const variant=["base","parallel","reprint","uncertain"].includes(data.variant_hint)?data.variant_hint:"uncertain";
    return reply(res,200,{
      code:boundedString(data.code,24).toUpperCase().replace(/\s/g,""),
      name:boundedString(data.name,130),
      confidence,
      variant_hint:variant,
      readable_code:data.readable_code===true,
      art_description:boundedString(data.art_description,120)
    });
  }catch(e){
    if(e.name==="TimeoutError"||e.name==="AbortError")return reply(res,504,{error:"La IA ha tardado demasiado. Vuelve a intentar."});
    console.warn("vision recognition failed",e?.name||"error");
    return reply(res,502,{error:"No se pudo completar el reconocimiento con IA."});
  }
}