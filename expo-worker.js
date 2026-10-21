// Exhibition host only. It does not alter the operating home worker's routes.
import {runtimeEntries,runtimeAssets} from './demos/erp-expo/runtime_assets.js';
const role=/^expo-(admin|staff|member)-0[1-8]\.coopco\.kr$/;
const robots='User-agent: *\nDisallow: /\n';
const icon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#edf5e9"/><circle cx="32" cy="32" r="13" fill="#f1b83e"/><path d="M32 5v7m0 40v7M5 32h7m40 0h7M13 13l5 5m28 28 5 5M13 51l5-5m28-28 5-5" stroke="#d69a25" stroke-width="5" stroke-linecap="round"/></svg>';
const csp="default-src 'none'; script-src 'self' https://esm.sh; style-src 'self' 'unsafe-inline'; connect-src https://ifdqlwxgqgsvnawmhlfc.supabase.co https://esm.sh; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'; upgrade-insecure-requests";
// Only the exhibition hosts use the original static ERP assets. Authentication,
// tenant rights, per-function review and expiry are independently checked by DB.
const runtimeCsp="default-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://esm.sh https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com https://t1.daumcdn.net; style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://unpkg.com https://webfontworld.github.io; connect-src 'self' https://ifdqlwxgqgsvnawmhlfc.supabase.co https://esm.sh https://cdn.jsdelivr.net https://cdnjs.cloudflare.com https://unpkg.com; img-src 'self' data: blob:; font-src 'self' data: https://cdn.jsdelivr.net https://webfontworld.github.io; frame-src 'self' blob: https://postcode.map.daum.net; worker-src 'self' blob:; frame-ancestors 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests";
const publicFont=/^assets\/home-fonts\/(?:do-hyeon|gmarket-sans|gowun-batang|gowun-dodum|ibm-plex-sans-kr|nanum-gothic|nanum-myeongjo|noto-sans-kr|noto-serif-kr|pretendard)\/[a-zA-Z0-9._-]+\.woff2?$/;
export function runtimePath(pathname,portal,search){
 if(portal)return '';
 let path=pathname.replace(/^\//,'');
 if(path==='erp'||path==='erp/')path='erp/index.html';
 else if(!path.split('/').pop().includes('.'))path+='.html';
 if(path==='index.html'&&new URLSearchParams(search).get('home_preview')!=='1')return '';
 return runtimeAssets.has(path)||publicFont.test(path)?'/'+path:'';
}
export function rewriteExpoHTML(html){
 // Trusted source assets only. Strip operating search metadata and analytics;
 // injected context runs before any existing SDK/client/route script.
 let value=html.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi,'')
  .replace(/<meta\b[^>]*(?:name|property)=["'](?:robots|description|keywords|application-name|apple-mobile-web-app-title|naver-site-verification|coop-tenant-(?:name|profile)|og:[^"']+|twitter:[^"']+)["'][^>]*>/gi,'')
  .replace(/<link\b[^>]*rel=["'](?:canonical|[^"']*icon[^"']*|alternate)["'][^>]*>/gi,'')
  .replace(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi,'')
  .replace(/<script\b[^>]*src=["'][^"']*(?:cloudflareinsights|googletagmanager|google-analytics)[^"']*["'][^>]*>[\s\S]*?<\/script>/gi,'');
 for(const id of ['public-contact-email','public-contact-phone','public-contact-address','opsContactPhone','opsContactEmail','about-title','about-subtitle','about-content']){
  const re=new RegExp('(<([a-z][a-z0-9]*)\\b[^>]*\\bid=["\\\']'+id+'["\\\'][^>]*>)[\\s\\S]*?(<\\/\\2>)','gi');
  value=value.replace(re,'$1$3');
 }
 value=value.replace(/(<[^>]*\bid=["']about-img-src["'][^>]*?)\s+src=["'][^"']*["']/gi,'$1');
 return value.replace(/<head\b[^>]*>/i,'$&<meta name="robots" content="noindex,nofollow,noarchive,nosnippet"><meta name="coop-tenant-profile" content="exhibition"><meta name="coop-tenant-name" content="햇빛 체험조합"><title>햇빛 체험조합 ERP</title><link rel="icon" href="/favicon.svg"><style>#btnLinkKakao,#btnLinkNaver,#kakaoLinkHint,#naverLinkHint{display:none!important}</style><script src="/demos/erp-expo/frame_boot.js?v=20261021-1"></script>');
}
export function rewriteExpoModule(code){
 const original="https://esm.sh/@supabase/supabase-js@2.112.2";
 if(!code.includes(original))throw Error('Expo SDK source changed');
 return code.replace(original,'/demos/erp-expo/sdk.js?v=20261021-1');
}
export default{async fetch(request,env){
 const url=new URL(request.url),portal=url.hostname==='expo.coopco.kr';
 const headers={'X-Robots-Tag':'noindex, nofollow, noarchive, nosnippet','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':csp,'Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
 if(!portal&&!role.test(url.hostname))return new Response('Not found',{status:404,headers});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers});
 if(url.pathname==='/favicon.ico'||url.pathname==='/favicon.svg')return new Response(request.method==='HEAD'?null:icon,{headers:{...headers,'Content-Type':'image/svg+xml; charset=utf-8'}});
 if(url.pathname==='/coop-branding.json')return new Response(request.method==='HEAD'?null:JSON.stringify({display_url:null,icon_url:null}),{headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
 if(url.pathname==='/robots.txt')return new Response(request.method==='HEAD'?null:robots,{headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
 if(url.pathname==='/')url.pathname=portal?'/demos/erp-expo/index.html':url.searchParams.get('home_preview')==='1'?'/index.html':'/demos/erp-expo/workspace.html';
 const runtime=runtimePath(url.pathname,portal,url.search);
 if(runtime){url.pathname=runtime;headers['Content-Security-Policy']=runtimeCsp;}
 if(!runtime&&!/^\/demos\/erp-expo\/(index|enter|workspace)\.html$/.test(url.pathname)&&!/^\/demos\/erp-expo\/(client|portal|enter|workspace|attachments|frame_boot|sdk)\.js$/.test(url.pathname)&&url.pathname!=='/demos/erp-expo/expo.css'&&url.pathname!=='/shared/coop_dialog.js'&&url.pathname!=='/shared/checked_upload.js')return new Response('Not found',{status:404,headers});
 const asset=await env.ASSETS.fetch(new Request(url,request));
 let body=asset.body;
 if(asset.ok&&runtimeEntries.has(runtime.slice(1))){body=rewriteExpoHTML(await asset.text());}
 else if(asset.ok&&runtime==='/shared/supabase-client.js'){body=rewriteExpoModule(await asset.text());}
 const result=new Response(request.method==='HEAD'?null:body,asset);for(const [key,value] of Object.entries(headers))result.headers.set(key,value);
 if(runtime){result.headers.delete('etag');result.headers.delete('content-length');}
 return result;
}};
