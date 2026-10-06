const VERSION='20261006-2';
const SUN_IMAGE='/shared/sun_share.png';
const SUN_ICON='/shared/sun_favicon.svg?v=1.0.0';
const NOINDEX='noindex, nofollow, noarchive, nosnippet';
const PRIVATE_ROBOTS='User-agent: *\nDisallow: /\n';
const SECURITY_VERSION='20261004-1';

const profile=(id,name,appName,description,origin,publicHosts=[],extra={})=>Object.freeze({
  id,name,appName,description,origin,publicHosts:new Set(publicHosts),...extra
});

const PROFILES=Object.freeze({
  main:profile('main','용인모두의햇빛협동조합','용인모두의햇빛협동조합','용인 시민이 함께 출자하고 운영하는 재생에너지 협동조합입니다.','https://www.yonginsolar.kr',['yonginsolar.kr','www.yonginsolar.kr'],{passThrough:true}),
  mainErp:profile('main-erp','용인모두의햇빛협동조합','용인모두의햇빛협동조합 ERP','용인모두의햇빛협동조합 업무 시스템입니다.','https://erp.yonginsolar.kr'),
  citizen:profile('citizen','용인시민햇빛발전협동조합','용인시민햇빛발전협동조합','용인시민햇빛발전협동조합의 조합 소개, 활동 소식과 조합원 가입 안내를 확인하세요.','https://yonginsun.kr',['yonginsun.kr','www.yonginsun.kr'],{
    imageOrigin:'https://yonginsun.kr',feedOrigin:'https://yonginsun.kr',naver:'f70e8afa4d0653dd97262e5ace51522cdecb34d1'
  }),
  citizenErp:profile('citizen-erp','용인시민햇빛발전협동조합','용인시민햇빛발전협동조합 ERP','용인시민햇빛발전협동조합 업무 시스템입니다.','https://erp.yonginsun.kr',[],{imageOrigin:'https://yonginsun.kr'}),
  citizenTemporary:profile('citizen-temporary','용인시민햇빛발전협동조합','용인시민햇빛발전협동조합','용인시민햇빛발전협동조합 임시 접속 주소입니다.','https://yonginsun.kr',[],{imageOrigin:'https://yonginsun.kr'}),
  hwaseong:profile('hwaseong','화성시민재생에너지발전협동조합','화성시민재생에너지발전협동조합','화성시민재생에너지발전협동조합의 조합 소개, 활동 소식과 조합원 가입 안내를 확인하세요.','https://hcrec.kr',['hcrec.kr','www.hcrec.kr'],{imageOrigin:'https://hcrec.kr',feedOrigin:'https://hcrec.kr'}),
  hwaseongErp:profile('hwaseong-erp','화성시민재생에너지발전협동조합','화성시민재생에너지발전협동조합 ERP','화성시민재생에너지발전협동조합 업무 시스템입니다.','https://erp.hcrec.kr',[],{imageOrigin:'https://hcrec.kr'}),
  sunVillage:profile('sun-village','햇빛소득마을','햇빛소득마을 운영관리','햇빛소득마을 협동조합 운영관리 시스템입니다.','https://sunvillage-demo.coopco.kr'),
  gyeonggiEnergy:profile('gyeonggi-energy','경기에너지협동조합','경기에너지협동조합 운영관리','경기에너지협동조합 운영관리 시스템입니다.','https://ggenergy.coopco.kr'),
  auth:profile('auth','협동조합 인증','협동조합 인증','협동조합 서비스의 안전한 로그인과 인증을 처리합니다.','https://auth.coopco.kr'),
  neutral:profile('unregistered','협동조합 운영시스템','협동조합 운영시스템','협동조합 운영을 위한 전용 시스템입니다.','')
});

const HOST_PROFILES=new Map([
  ['yonginsolar.kr',PROFILES.main],['www.yonginsolar.kr',PROFILES.main],['erp.yonginsolar.kr',PROFILES.mainErp],
  ['yonginsun.kr',PROFILES.citizen],['www.yonginsun.kr',PROFILES.citizen],['erp.yonginsun.kr',PROFILES.citizenErp],
  ['yonginsun.coopco.kr',PROFILES.citizenTemporary],['sunvillage-demo.coopco.kr',PROFILES.sunVillage],
  ['hcrec.kr',PROFILES.hwaseong],['www.hcrec.kr',PROFILES.hwaseong],['erp.hcrec.kr',PROFILES.hwaseongErp],
  ['ggenergy.coopco.kr',PROFILES.gyeonggiEnergy],['auth.coopco.kr',PROFILES.auth]
]);
const PRIVATE_PREFIXES=['/erp','/membermanage','/auth_callback','/auth_broker','/guardian_consent','/vote','/minutes','/bak','/terms','/privacy'];

const CITIZEN_ROBOTS=`User-agent: *
Allow: /
Disallow: /erp
Disallow: /membermanage
Disallow: /auth_callback
Disallow: /auth_broker
Disallow: /guardian_consent
Disallow: /vote
Disallow: /minutes/
Disallow: /bak/

Sitemap: https://yonginsun.kr/sitemap.xml
`;
const CITIZEN_SITEMAP=`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://yonginsun.kr/</loc></url>
  <url><loc>https://yonginsun.kr/signup</loc></url>
</urlset>
`;
const CITIZEN_RSS=`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>용인시민햇빛발전협동조합</title>
    <link>https://yonginsun.kr/</link>
    <description><![CDATA[용인시민햇빛발전협동조합의 조합 소개와 조합원 가입 안내입니다.]]></description>
    <language>ko-KR</language>
    <lastBuildDate>Wed, 16 Sep 2026 04:00:00 GMT</lastBuildDate>
    <atom:link href="https://yonginsun.kr/rss.xml" rel="self" type="application/rss+xml" />
    <item>
      <title>용인시민햇빛발전협동조합 홈페이지</title>
      <link>https://yonginsun.kr/</link>
      <guid isPermaLink="true">https://yonginsun.kr/</guid>
      <pubDate>Wed, 16 Sep 2026 04:00:00 GMT</pubDate>
      <description><![CDATA[용인시민햇빛발전협동조합의 조합 소개, 시민참여형 태양광 활동과 조합원 참여 안내를 확인할 수 있습니다.]]></description>
    </item>
    <item>
      <title>조합원 가입 안내</title>
      <link>https://yonginsun.kr/signup</link>
      <guid isPermaLink="true">https://yonginsun.kr/signup</guid>
      <pubDate>Wed, 16 Sep 2026 04:00:00 GMT</pubDate>
      <description><![CDATA[용인시민햇빛발전협동조합 조합원 가입 신청에 필요한 정보와 출자 참여 절차를 확인하고 온라인으로 가입을 신청할 수 있습니다.]]></description>
    </item>
  </channel>
</rss>
`;

// Only this registered public cooperative gets these files; private hosts never
// inherit another cooperative's feeds or search ownership verification.
const HWASEONG_ROBOTS=CITIZEN_ROBOTS.replaceAll('https://yonginsun.kr','https://hcrec.kr');
const HWASEONG_SITEMAP=CITIZEN_SITEMAP.replaceAll('https://yonginsun.kr','https://hcrec.kr');
const HWASEONG_RSS=`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>화성시민재생에너지발전협동조합</title>
    <link>https://hcrec.kr/</link>
    <description>화성시민재생에너지발전협동조합의 조합 소개와 조합원 가입 안내입니다.</description>
    <language>ko-KR</language>
    <atom:link href="https://hcrec.kr/rss.xml" rel="self" type="application/rss+xml" />
    <item>
      <title>화성시민재생에너지발전협동조합 홈페이지</title>
      <link>https://hcrec.kr/</link>
      <guid isPermaLink="true">https://hcrec.kr/</guid>
      <description>조합 소개와 활동 소식, 조합원 가입 안내를 확인하세요.</description>
    </item>
    <item>
      <title>조합원 가입 안내</title>
      <link>https://hcrec.kr/signup</link>
      <guid isPermaLink="true">https://hcrec.kr/signup</guid>
      <description>화성시민재생에너지발전협동조합의 조합원 가입 안내입니다.</description>
    </item>
  </channel>
</rss>
`;

const esc=value=>String(value).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
const host=value=>String(value||'').trim().toLowerCase().replace(/\.$/,'');
const cleanPath=value=>{
  const result=String(value||'/').replace(/\/+$/,'').replace(/\.html$/i,'')||'/';
  return result==='/index'?'/':result;
};
const getProfile=hostname=>HOST_PROFILES.get(host(hostname))||PROFILES.neutral;
const isPublic=(p,hostname)=>p.publicHosts.has(host(hostname));
const noIndex=(p,hostname,pathname)=>{
  if(!isPublic(p,hostname))return true;
  const value=cleanPath(pathname).toLowerCase();
  return PRIVATE_PREFIXES.some(prefix=>value===prefix||value.startsWith(prefix+'/'));
};

function textResponse(request,body,type,status=200){
  return new Response(request.method==='HEAD'?null:body,{status,headers:{
    'Content-Type':type,'Cache-Control':status===200?'public, max-age=300':'public, max-age=60',
    'X-Content-Type-Options':'nosniff','X-Tenant-Metadata-Version':VERSION
  }});
}

function labelFor(p,pathname){
  const value=cleanPath(pathname).toLowerCase();
  const labels={
    '/signup':'조합원 가입','/membermanage':'조합원 관리','/privacy':'개인정보 처리방침','/terms':'이용약관',
    '/guardian_consent':'법정대리인 동의','/auth_broker_start':'로그인','/auth_broker_complete':'로그인 완료'
  };
  if(labels[value])return labels[value];
  if(value==='/erp'||value.startsWith('/erp/'))return 'ERP';
  if(p.id==='auth'&&value!=='/')return '인증';
  return '';
}

function headMetadata(p,url){
  const pathname=cleanPath(url.pathname),blocked=noIndex(p,url.hostname,url.pathname),label=labelFor(p,url.pathname);
  const title=label?`${label} | ${p.name}`:p.appName;
  const description=label?`${p.name} ${label} 페이지입니다.`:p.description;
  const origin=p.origin||`${url.protocol}//${url.host}`;
  const canonical=origin+pathname;
  const image=(p.imageOrigin||origin)+SUN_IMAGE+'?v='+VERSION;
  const meta=(kind,name,value)=>`<meta ${kind}="${name}" content="${esc(value)}">`;
  let result='<meta charset="utf-8"><title>'+esc(title)+'</title>'
    +'<link rel="canonical" href="'+esc(canonical)+'">'
    +meta('name','robots',blocked?NOINDEX:'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1')
    +meta('name','description',description)+meta('name','application-name',p.appName)
    +meta('name','apple-mobile-web-app-title',p.appName)+meta('name','coop-tenant-profile',p.id)
    +meta('name','coop-tenant-name',p.name)+meta('name','tenant-metadata-version',VERSION)
    +meta('property','og:type','website')+meta('property','og:site_name',p.name)+meta('property','og:title',title)
    +meta('property','og:description',description)+meta('property','og:url',canonical)+meta('property','og:image',image)
    +meta('property','og:image:type','image/png')+meta('property','og:image:width','512')+meta('property','og:image:height','512')
    +meta('property','og:image:alt',p.name+' 태양')+meta('name','twitter:card','summary')
    +meta('name','twitter:title',title)+meta('name','twitter:description',description)+meta('name','twitter:image',image)
    +'<link rel="icon" type="image/svg+xml" href="'+SUN_ICON+'"><link rel="apple-touch-icon" href="'+esc(image)+'">';
  if(!blocked&&p.naver)result+=meta('name','naver-site-verification',p.naver);
  if(!blocked&&p.feedOrigin)result+='<link rel="alternate" type="application/rss+xml" title="'+esc(p.name)+' RSS" href="'+p.feedOrigin+'/rss.xml">';
  if(!blocked)result+='<script type="application/ld+json">'+JSON.stringify({
    '@context':'https://schema.org','@type':'Organization',name:p.name,url:origin+'/',logo:image
  })+'</script>';
  return result;
}

function addProfileHeaders(headers,p,blocked,revalidate=true){
  headers.set('X-Tenant-Metadata-Version',VERSION);
  headers.set('X-Tenant-Profile',p.id);
  if(revalidate)headers.set('Cache-Control','public, max-age=0, must-revalidate');
  if(p.id.startsWith('citizen'))headers.set('X-Citizen-Brand-Version',VERSION);
  if(blocked)headers.set('X-Robots-Tag',NOINDEX);
}

function withProfileHeaders(response,p,blocked,headRequest=false,revalidate=false){
  const headers=new Headers(response.headers);
  if(revalidate)headers.delete('etag');
  headers.delete('content-length');addProfileHeaders(headers,p,blocked,revalidate);
  return new Response(headRequest?null:response.body,{status:response.status,statusText:response.statusText,headers});
}

class RemoveElement{element(element){element.remove();}}

// Keep normal scripts, social popups, PDF workers and preview frames usable.
// Public homepage previews may be embedded by the registered ERP hosts only;
// private screens cannot be framed by another origin.
function secureResponse(request,response){
  const url=new URL(request.url),headers=new Headers(response.headers);
  headers.set('X-Content-Type-Options','nosniff');
  headers.set('X-Coop-Security-Version',SECURITY_VERSION);
  const privatePath=noIndex(getProfile(url.hostname),url.hostname,url.pathname)||url.pathname.startsWith('/ai/');
  headers.set('Referrer-Policy',privatePath?'no-referrer':'strict-origin-when-cross-origin');
  if(url.protocol==='https:')headers.set('Strict-Transport-Security','max-age=86400');
  if((headers.get('Content-Type')||'').toLowerCase().includes('text/html')){
    const parents=privatePath?"'self'":
      "'self' "+[...HOST_PROFILES.keys()].filter(h=>h!=='auth.coopco.kr').map(h=>'https://'+h).join(' ');
    headers.set('Content-Security-Policy',`base-uri 'self'; object-src 'none'; frame-ancestors ${parents}`);
    if(privatePath)headers.set('X-Frame-Options','SAMEORIGIN');
  }
  return new Response(request.method==='HEAD'?null:response.body,{status:response.status,statusText:response.statusText,headers});
}

async function routeRequest(request,env){
  const url=new URL(request.url),hostname=host(url.hostname),p=getProfile(hostname);
  if(hostname==='www.hcrec.kr'){
    const target=new URL(request.url);target.hostname='hcrec.kr';target.protocol='https:';
    return Response.redirect(target.href,308);
  }
  if(hostname==='erp.hcrec.kr'&&['/','/index','/index.html'].includes(url.pathname)){
    const target=new URL(request.url);target.pathname='/erp/';target.protocol='https:';
    return Response.redirect(target.href,307);
  }
  const aiRoute = url.pathname === '/ai/mcp' ? '/mcp/' + hostname
    : /^\/ai\/oauth\/(register|authorize|token)$/.test(url.pathname) ? '/oauth/' + hostname + '/' + url.pathname.split('/').pop()
    : url.pathname === '/.well-known/oauth-protected-resource/ai/mcp' ? '/.well-known/oauth-protected-resource/mcp/' + hostname
    : url.pathname === '/.well-known/oauth-authorization-server/ai/oauth' ? '/.well-known/oauth-authorization-server/oauth/' + hostname : null;
  if(aiRoute){
    if(p.id==='unregistered'||p.id==='auth')return new Response('Not Found',{status:404,headers:{'Cache-Control':'no-store','X-Robots-Tag':'noindex'}});
    const target=new URL('https://ifdqlwxgqgsvnawmhlfc.supabase.co/functions/v1/erp-ai'+aiRoute);
    target.search=url.search;
    const forwarded=new Headers();
    for(const key of ['Authorization','Content-Type','Accept','Origin','MCP-Protocol-Version']){
      const value=request.headers.get(key);if(value)forwarded.set(key,value);
    }
    const upstream=await fetch(target,{method:request.method,headers:forwarded,
      body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'});
    const headers=new Headers(upstream.headers);headers.set('Cache-Control','no-store');headers.set('X-Robots-Tag','noindex,nofollow');
    headers.delete('Set-Cookie');
    return new Response(upstream.body,{status:upstream.status,headers});
  }
  if(p.passThrough)return env.ASSETS.fetch(request);

  if(p.id==='hwaseong'&&isPublic(p,hostname)){
    if(url.pathname==='/robots.txt')return textResponse(request,HWASEONG_ROBOTS,'text/plain; charset=utf-8');
    if(url.pathname==='/sitemap.xml')return textResponse(request,HWASEONG_SITEMAP,'application/xml; charset=utf-8');
    if(url.pathname==='/rss.xml'||url.pathname==='/feed.xml')return textResponse(request,HWASEONG_RSS,'application/rss+xml; charset=utf-8');
  }

  if(url.pathname==='/robots.txt')return textResponse(request,p.id==='citizen'&&isPublic(p,hostname)?CITIZEN_ROBOTS:PRIVATE_ROBOTS,'text/plain; charset=utf-8');
  if(url.pathname==='/sitemap.xml')return p.id==='citizen'&&isPublic(p,hostname)
    ?textResponse(request,CITIZEN_SITEMAP,'application/xml; charset=utf-8')
    :textResponse(request,'Not Found\n','text/plain; charset=utf-8',404);
  if(url.pathname==='/rss.xml'||url.pathname==='/feed.xml')return p.id==='citizen'&&isPublic(p,hostname)
    ?textResponse(request,CITIZEN_RSS,'application/rss+xml; charset=utf-8')
    :textResponse(request,'Not Found\n','text/plain; charset=utf-8',404);
  if(url.pathname==='/favicon.ico'||url.pathname==='/apple-touch-icon.png'){
    const iconUrl=new URL(request.url);iconUrl.pathname=SUN_IMAGE;
    return env.ASSETS.fetch(new Request(iconUrl,request));
  }

  const leaf=url.pathname.split('/').pop()||'',headRequest=request.method==='HEAD';
  let assetRequest=request;
  if(!leaf.includes('.')||/\.html?$/i.test(leaf)){
    const headers=new Headers(request.headers);headers.delete('if-none-match');headers.delete('if-modified-since');
    assetRequest=new Request(request,{method:headRequest?'GET':request.method,headers});
  }
  const response=await env.ASSETS.fetch(assetRequest),blocked=noIndex(p,hostname,url.pathname);
  if(!(response.headers.get('content-type')||'').toLowerCase().includes('text/html'))return withProfileHeaders(response,p,blocked,headRequest);
  if(headRequest)return withProfileHeaders(response,p,blocked,true,true);

  const rewritten=new HTMLRewriter()
    .on('head',{element(element){element.prepend(headMetadata(p,url),{html:true});}})
    .on('head title, head link[rel="canonical"], head link[rel*="icon"], head link[rel="alternate"][type="application/rss+xml"], head script[type="application/ld+json"]',new RemoveElement())
    .on('head meta',{element(element){
      const name=(element.getAttribute('name')||element.getAttribute('property')||'').toLowerCase();
      if(element.hasAttribute('charset')||name.startsWith('og:')||name.startsWith('twitter:')||[
        'robots','description','keywords','application-name','apple-mobile-web-app-title','naver-site-verification',
        'citizen-brand-version','coop-tenant-profile','coop-tenant-name','tenant-metadata-version'
      ].includes(name))element.remove();
    }})
    .on('#siteBrandName, #public-hero-title, #opsContactOrgName',{element(element){
      if(p.id==='hwaseong'||p.id==='hwaseong-erp')element.setInnerContent(p.name);
    }})
    .on('#public-contact-email-wrap, #public-contact-phone-wrap, #public-contact-address-wrap, #opsContactPhone, #opsContactEmail',{element(element){
      if(p.id==='hwaseong'||p.id==='hwaseong-erp')element.setAttribute('hidden','');
    }})
    .on('#about-title, #about-subtitle, #about-content, #about-list',{element(element){
      if(p.id==='hwaseong')element.setInnerContent('');
    }})
    .on('#about-img-src',{element(element){
      if(p.id==='hwaseong')element.removeAttribute('src');
    }}).transform(response);
  rewritten.headers.delete('etag');rewritten.headers.delete('content-length');addProfileHeaders(rewritten.headers,p,blocked);
  return rewritten;
}

export default{async fetch(request,env){
  return secureResponse(request,await routeRequest(request,env));
}};
