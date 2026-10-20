/* v1.0.0 — Minimal SMS contact worksheet. No network, credentials or business writes. */
(function(root){
  'use strict';
  function phone(value){
    let text=String(value??'').normalize('NFKC').trim().replace(/[\s().-]/g,'');
    if (/^(?:\+82|0082|82)0?10\d{8}$/.test(text)) text='0'+text.replace(/^(?:\+82|0082|82)0?/,'');
    return /^010\d{8}$/.test(text)?text:'';
  }
  function build(records){
    const seen=new Set(),rows=[];
    for(const record of Array.isArray(records)?records:[]){
      const number=phone(record?.phone);
      if(!number||seen.has(number))continue;
      seen.add(number);rows.push({'이름':String(record?.name??'').trim(),'전화번호':number});
    }
    return rows;
  }
  function worksheet(XLSX,rows){
    const sheet=XLSX.utils.json_to_sheet(rows,{header:['이름','전화번호']});
    for(let r=1;r<=rows.length;r++)for(const col of ['A','B']){
      const cell=sheet[col+(r+1)];if(!cell)continue;
      cell.t='s';cell.v=String(cell.v??'');cell.z='@';delete cell.f;
    }
    sheet['!cols']=[{wch:24},{wch:18}];
    return sheet;
  }
  const api=Object.freeze({phone,build,worksheet});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.CoopMemberSmsExport=api;
})(typeof window==='object'?window:globalThis);
