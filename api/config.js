export default {
  async fetch() {
    const supabaseUrl=process.env.SUPABASE_URL||"";
    const supabaseKey=process.env.SUPABASE_PUBLISHABLE_KEY||"";
    if(!supabaseUrl||!supabaseKey)return Response.json({error:"Supabase config missing"},{status:500,headers:{"cache-control":"no-store"}});
    return Response.json({supabaseUrl,supabaseKey},{headers:{"cache-control":"no-store"}});
  }
};
