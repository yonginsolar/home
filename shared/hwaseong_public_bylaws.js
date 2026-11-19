(function (global) {
  'use strict';
  const tenant='4e2b5e2a-79b1-4beb-a4ec-8797ebe23028';
  const active=['hcrec.kr','www.hcrec.kr'].includes(String(global.location.hostname||'').toLowerCase().replace(/\.$/,''));
  if(active) document.documentElement.setAttribute('data-hcrec-bylaws','');
  function restrict(query,coop) {
    if(!active||coop!==tenant)throw new Error('PUBLIC_BYLAWS_CONTEXT_MISMATCH');
    return query.eq('coop_id',tenant).eq('category','doc').eq('is_active',true)
      .ilike('title','%규약%').not('title','ilike','%정관%').or('access_scope.eq.PUBLIC,access_scope.is.null');
  }
  function setAvailable(node,shown) {
    if(active && node) node.toggleAttribute('data-bylaws-available',shown===true);
  }
  function createPresence({node,client,getContext,read}) {
    let pending=null;
    const refresh=(attempt)=>{
      if(!active||!node)return Promise.resolve(false);
      if(pending)return pending;
      setAvailable(node,false);
      pending=read(async signal=>{
        const {coop_id}=await getContext()||{};
        return restrict(client.from('site_documents').select('id',{head:true,count:'exact'}),coop_id)
          .limit(1).abortSignal(signal);
      },attempt).then(r=>{
        const present=!r?.error && Number.isInteger(r?.count) && r.count>0;
        setAvailable(node,present);return present;
      },()=>false).finally(()=>{pending=null;});
      return pending;
    };
    return {refresh};
  }
  global.HwaseongPublicBylaws={active,restrict,setAvailable,createPresence};
})(window);
