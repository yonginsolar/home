/* 정식 조합명에 따른 표시·업무 기준. 권한은 기존 서버 검사를 그대로 사용한다. */
(function(root){
 'use strict';
 const kinds=Object.freeze({ordinary:'일반협동조합',social:'사회적협동조합',ordinary_federation:'협동조합연합회',social_federation:'사회적협동조합연합회',mixed_federation:'이종협동조합연합회',unknown:'법인유형 확인 필요'});
 function classify(formalName){
  const name=typeof formalName==='string'?formalName.normalize('NFKC').replace(/\s+/gu,''):'';
  if(!name||name.length>200||/[<>\x00-\x1f]/.test(name)||/(?:소비자생활|신용|농업|수산업|중소기업)협동조합|산림조합|새마을금고|주식회사|유한회사|사단법인|재단법인/.test(name))return 'unknown';
  const tokens=[['이종협동조합연합회','mixed_federation'],['사회적협동조합연합회','social_federation'],['사회적협동조합','social'],['협동조합연합회','ordinary_federation'],['협동조합','ordinary']];
  for(const[token,kind]of tokens)if(name.includes(token)){const rest=name.replace(token,'');return /협동조합|연합회/.test(rest)?'unknown':kind;}
  return 'unknown';
 }
 function policy(formalName){const kind=classify(formalName),ordinary=['ordinary','ordinary_federation'].includes(kind),social=['social','social_federation'].includes(kind);return Object.freeze({kind,label:kinds[kind],known:ordinary||social,dividends:ordinary,reserveRate:ordinary?10:social?30:null,allDisclosure:social||kind==='mixed_federation',federation:kind.endsWith('_federation')});}
 function integer(n,label,{negative=false}={}){if(!Number.isSafeInteger(n)||!negative&&n<0)throw Error(label+'을 확인해 주세요.');return BigInt(n);}
 function reserve({formalName,profit,capital,balance,deficit=0,rate}){
  const p=policy(formalName);if(!p.known)throw Error('결산할 조합의 법인유형을 확인해 주세요.');
  const income=integer(profit,'세후 손익',{negative:true}),paid=integer(capital,'기말 납입출자금'),saved=integer(balance,'기존 법정적립금'),loss=integer(deficit,'이월결손금');
  const percent=rate===undefined?p.reserveRate:rate;if(typeof percent!=='number'||!/^\d{1,3}(?:\.\d{1,2})?$/.test(String(percent))||percent<p.reserveRate||percent>100)throw Error('적립률은 법정 최저 '+p.reserveRate+'% 이상 100% 이하로 입력해 주세요.');
  const available=income>loss?income-loss:0n,target=paid*3n,remaining=target>saved?target-saved:0n;
  // 목표에 도달하기 전에는 최소비율을 적용한다. 임의로 목표 잔액에 잘라 법정비율을 낮추지 않는다.
  const minimum=remaining>0n?(available*BigInt(Math.round(percent*100))+9999n)/10000n:0n;
  for(const n of [available,target,remaining,minimum])if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('적립금 계산 금액이 안전 범위를 벗어났습니다.');
  return {kind:p.kind,rate:percent,available:Number(available),target:Number(target),remaining:Number(remaining),minimum:Number(minimum),thresholdMet:remaining===0n,voluntary:p.dividends?null:Number(available-minimum),deficit:Number(loss)};
 }
 function disclosure({formalName,year,today,members=null,approvedCapital=null,capitalApproved=false,preferredShares=false}){
  if(!Number.isInteger(year)||year<1901||year>9998||!/^\d{4}-\d{2}-\d{2}$/.test(today||''))throw Error('공시 기준연도를 확인해 주세요.');
  const p=policy(formalName),end=year+'-12-31',provisional=end>=today;
  for(const[n,label]of[[members,'기말 인원'],[approvedCapital,'승인된 납입출자금']])if(n!==null)integer(n,label);
  const memberTarget=members!==null&&members>=200,capitalTarget=capitalApproved&&approvedCapital!==null&&approvedCapital>=3000000000;
  const required=p.allDisclosure||p.known&&(memberTarget||capitalTarget||preferredShares);
  const complete=p.known&&members!==null&&capitalApproved&&approvedCapital!==null;
  const uncertainPeriod=provisional&&!p.allDisclosure&&!preferredShares;
  return {kind:p.kind,end,deadline:(year+1)+'-04-30',provisional,required:uncertainPeriod?null:required?true:complete?false:null,memberTarget,capitalTarget,preferredShares,memberLabel:p.federation?'회원조합 소속 총조합원':'조합원',state:uncertainPeriod?'연말 규모 확인 전':required?'공시 대상':complete?'규모 기준 미해당':'대상 확인 필요'};
 }
 root.CoopRules=Object.freeze({classify,policy,reserve,disclosure,version:'1.0.0'});
})(typeof window==='undefined'?globalThis:window);
