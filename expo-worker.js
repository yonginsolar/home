// Exhibition host only. It does not alter the operating home worker's routes.
const role=/^expo-(admin|staff|member)-0[1-8]\.coopco\.kr$/;
const robots='User-agent: *\nDisallow: /\n';
const icon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="#edf5e9"/><circle cx="32" cy="32" r="13" fill="#f1b83e"/><path d="M32 5v7m0 40v7M5 32h7m40 0h7M13 13l5 5m28 28 5 5M13 51l5-5m28-28 5-5" stroke="#d69a25" stroke-width="5" stroke-linecap="round"/></svg>';
const csp="default-src 'none'; script-src 'self' https://esm.sh; style-src 'self' 'unsafe-inline'; connect-src https://ifdqlwxgqgsvnawmhlfc.supabase.co https://esm.sh; img-src 'self' data:; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'; upgrade-insecure-requests";
export default{async fetch(request,env){
 const url=new URL(request.url),portal=url.hostname==='expo.coopco.kr';
 const headers={'X-Robots-Tag':'noindex, nofollow, noarchive, nosnippet','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Content-Security-Policy':csp,'Permissions-Policy':'camera=(), microphone=(), geolocation=()'};
 if(!portal&&!role.test(url.hostname))return new Response('Not found',{status:404,headers});
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405,headers});
 if(url.pathname==='/favicon.ico'||url.pathname==='/favicon.svg')return new Response(request.method==='HEAD'?null:icon,{headers:{...headers,'Content-Type':'image/svg+xml; charset=utf-8'}});
 if(url.pathname==='/robots.txt')return new Response(request.method==='HEAD'?null:robots,{headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
 if(url.pathname==='/')url.pathname=portal?'/demos/erp-expo/index.html':'/demos/erp-expo/workspace.html';
 if(!/^\/demos\/erp-expo\/(index|enter|workspace)\.html$/.test(url.pathname)&&!/^\/demos\/erp-expo\/(client|portal|enter|workspace|attachments)\.js$/.test(url.pathname)&&url.pathname!=='/demos/erp-expo/expo.css'&&url.pathname!=='/shared/coop_dialog.js'&&url.pathname!=='/shared/checked_upload.js')return new Response('Not found',{status:404,headers});
 const asset=await env.ASSETS.fetch(new Request(url,request));
 const result=new Response(asset.body,asset);for(const [key,value] of Object.entries(headers))result.headers.set(key,value);
 return result;
}};
