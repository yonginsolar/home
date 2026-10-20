/* Financial statement arithmetic 1.0.0. No AI, Auth, storage or network. */
(function(root){'use strict';
 const fields={
  balance:[['assets','자산 총계',['자산총계']],['current_assets','유동자산',['유동자산']],['cash','현금 및 현금성자산',['현금및현금성자산','현금및현금등가물']],['liabilities','부채 총계',['부채총계']],['current_liabilities','유동부채',['유동부채']],['equity','자본 총계',['자본총계']],['capital','출자금',['출자금','자본금']],['capital_deposits','출자예치금',['출자예치금']],['retained','이익잉여금',['이익잉여금']]],
  income:[['revenue','매출액',['매출액']],['cost','매출원가',['매출원가']],['sga','판매비와 관리비',['판매비와관리비','판매비및관리비']],['operating','영업이익(손실)',['영업이익','영업손실','영업이익(손실)']],['other_income','영업외수익',['영업외수익']],['other_expense','영업외비용',['영업외비용']],['pretax','법인세 차감 전 이익(손실)',['법인세차감전이익','법인세차감전순이익','법인세차감전순손실','법인세차감전이익(손실)']],['tax','법인세 등',['법인세등','법인세비용']],['net','당기순이익(손실)',['당기순이익','당기순손실','당기순이익(손실)']]]
 };
 const required={balance:['assets','liabilities','equity'],income:['revenue','operating','net']};
 function amount(value){if(value===null||String(value??'').trim()==='')return null;const s=String(value).trim().replace(/[−△▲]/g,'-').replace(/\s/g,'');if(!/^(?:-?(?:\d+|\d{1,3}(?:,\d{3})+)|\((?:\d+|\d{1,3}(?:,\d{3})+)\))$/.test(s))return NaN;const n=Number(s.replace(/,/g,'').replace(/^\((.*)\)$/,'-$1'));return Number.isSafeInteger(n)?n:NaN;}
 const label=s=>String(s).replace(/\s/g,'').replace(/^[\d.ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩⅪⅫIVXivx·ㆍ]+/,'').trim();
 function parse(lines){
  const text=lines.map(l=>l.text).join('\n'),compact=text.replace(/\s/g,'');
  const kind=compact.includes('재무상태표')&&!compact.includes('손익계산서')?'balance':compact.includes('손익계산서')&&!compact.includes('재무상태표')?'income':null;
  const unitMatch=compact.match(/단위[:：]?[（(]?(백만원|천원|원)/),unit=unitMatch?.[1]||'';
  const dates=[];for(const m of text.slice(0,2000).matchAll(/(20\d{2}|19\d{2})\s*(?:년|[./-])\s*(\d{1,2})\s*(?:월|[./-])\s*(\d{1,2})\s*일?/g)){const d=m[1]+'-'+m[2].padStart(2,'0')+'-'+m[3].padStart(2,'0');if(!dates.includes(d))dates.push(d);}
  const columns=kind==='income'?[[dates[0],dates[1]],[dates[2],dates[3]]]:[[null,dates[0]],[null,dates[1]]];
  const values=[{},{}],seen=new Map();
  if(kind)for(const line of lines){
   const matches=[...line.text.matchAll(/(?:[△▲−-]\s*|\()?\d{1,3}(?:,\d{3})+(?:\))?|(?:[△▲−-]\s*|\()?\d+(?:\))?/g)];
   // Section ordinals are not amounts. Only tokens following the Korean account name count.
   const firstKorean=line.text.search(/[가-힣]/);const numbers=matches.filter(m=>m.index>firstKorean&&m.index>0);
   const firstNumber=numbers[0]?.index??line.text.length;const name=label(line.text.slice(0,firstNumber));
   const spec=fields[kind].find(f=>f[2].some(a=>label(a)===name));if(!spec||numbers.length<1||numbers.length>2)continue;
   const nums=numbers.map(m=>amount(m[0]));if(nums.some(n=>!Number.isFinite(n)))continue;
   if(/손실/.test(name)&&!name.includes('(손실)'))for(let i=0;i<nums.length;i++)if(nums[i]>0)nums[i]=-nums[i];
   const prior=seen.get(spec[0]);if(prior&&JSON.stringify(prior)!==JSON.stringify(nums)){seen.set(spec[0],false);delete values[0][spec[0]];delete values[1][spec[0]];continue;}if(prior===false)continue;
   seen.set(spec[0],nums);nums.forEach((n,i)=>values[i][spec[0]]=n);
  }
  return{kind,unit,columns:columns.map((period,i)=>({year:period[1]?Number(period[1].slice(0,4)):null,period_from:period[0]||'',period_to:period[1]||'',metrics:values[i]})),lines};
 }
 function issues(kind,m){const out=[];for(const k of required[kind]||[])if(m[k]===null||m[k]===undefined)out.push((fields[kind].find(f=>f[0]===k)?.[1]||k)+' 금액이 필요합니다.');for(const [k,v]of Object.entries(m))if(v!==null&&!Number.isSafeInteger(v))out.push((fields[kind]?.find(f=>f[0]===k)?.[1]||k)+' 금액은 정수로 입력해 주세요.');const has=(...ks)=>ks.every(k=>Number.isSafeInteger(m[k]));
  if(kind==='balance'&&has('assets','liabilities','equity')&&BigInt(m.assets)!==BigInt(m.liabilities)+BigInt(m.equity))out.push('자산 총계와 부채·자본 합계가 맞지 않습니다.');
  for(const [ks,compute,message]of [[['revenue','cost','sga','operating'],a=>a[0]-a[1]-a[2]-a[3],'매출액 − 매출원가 − 판매비와 관리비가 영업이익과 맞지 않습니다.'],[['operating','other_income','other_expense','pretax'],a=>a[0]+a[1]-a[2]-a[3],'영업이익과 영업외손익 합계가 법인세 차감 전 이익과 맞지 않습니다.'],[['pretax','tax','net'],a=>a[0]-a[1]-a[2],'법인세 차감 전 이익 − 법인세 등이 당기순이익과 맞지 않습니다.']])if(kind==='income'&&has(...ks)&&compute(ks.map(k=>BigInt(m[k])))!==0n)out.push(message);
  return out;
 }
 function ratios(balance,income){const b=balance?.metrics||{},i=income?.metrics||{};const ratio=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0? a/b*100:null;return{operating_margin:ratio(i.operating,i.revenue),net_margin:ratio(i.net,i.revenue),debt_ratio:ratio(b.liabilities,b.equity),current_ratio:ratio(b.current_assets,b.current_liabilities)};}
 function comparable(a,b){if(!a||!b||a.kind!==b.kind||a.year!==b.year+1)return false;return a.period_to?.slice(5)===b.period_to?.slice(5)&&(a.kind==='balance'||(a.period_from?.slice(5)===b.period_from?.slice(5)&&Number(a.period_to.slice(0,4))-Number(a.period_from.slice(0,4))===Number(b.period_to.slice(0,4))-Number(b.period_from.slice(0,4))));}
 const api=Object.freeze({version:'1.0.0',fields,required,amount,parse,issues,ratios,comparable});root.FinancialStatementsEngine=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window==='undefined'?globalThis:window);
