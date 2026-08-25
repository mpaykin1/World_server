self.onmessage=async(e)=>{
  const {id,kind,buffer}=e.data||{};
  try{
    if(kind!=='sha256') throw new Error('unsupported exact import worker operation');
    const digest=await crypto.subtle.digest('SHA-256',buffer);
    self.postMessage({id,digest},[digest]);
  }catch(err){ self.postMessage({id,error:String(err?.message||err)}); }
};
