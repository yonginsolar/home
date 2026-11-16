/* 경영공시 읽기 전용 회계값. 회계관리의 원천 검증·계정 정규화·손익마감 제외 계산을 재사용한다. */
(function(root){'use strict';
const SALARY_INSURANCE_EXPENSE_ACCOUNT = '4대보험회사분';

const ACCOUNTING_REPORT_ASSET_ACCOUNTS = new Set(['부가세대급금', '보통예금', '현금', '선급금', '미수금', '선납세금', '선납법인세', '선납법인지방소득세']);

const ACCOUNTING_REPORT_ACCOUNT_ALIAS_BY_COMPACT = {
    '부가세대급금': '부가세대급금',
    '부가세예수금': '부가세예수금',
    '임직원급여': '임직원급여',
    '급여': '임직원급여',
    '잡이익': '잡이익',
    '잡손실': '잡손실'
};

function normalizeAccountingReportAccountName(rowOrName, description = '') {
    const isRowObject = rowOrName && typeof rowOrName === 'object';
    const raw = String(isRowObject ? rowOrName?.Account : rowOrName || '').trim();
    if (!raw) return '';
    const desc = String(isRowObject ? rowOrName?.Description : description || '').trim();
    const compact = raw.replace(/\s+/g, '');

    if (compact === '세금과공과') {
        if (desc.includes('4대보험') || desc.includes('회사부담분')) return SALARY_INSURANCE_EXPENSE_ACCOUNT;
        if (desc.includes('등록면허세')) return '등록면허세';
        if (desc.includes('주민세') || desc.includes('재산세')) return '주민세/재산세';
        if (desc.includes('협회비')) return '협회비';
        if (desc.includes('과태료') || desc.includes('벌금')) return '과태료/벌금';
        if (desc.includes('법인세')) return '법인세비용';
    }

    return ACCOUNTING_REPORT_ACCOUNT_ALIAS_BY_COMPACT[compact] || raw;
}

function normalizeAccountingReportType(type, account) {
    if (ACCOUNTING_REPORT_ASSET_ACCOUNTS.has(account)) return '자산';
    if (account === '부가세예수금') return '부채';
    if (account === '잡이익') return '영업외수익';
    if (account === '잡손실') return '비용';
    return String(type || '').trim();
}

function buildClosingIncomeSummary(rows) {
    const balances = {};
    const rev = {};
    const exp = {};
    const otherRev = {};
    let tRev = 0;
    let tExp = 0;
    let tOtherRev = 0;

    (rows || []).forEach((row) => {
        const debit = Number(row?.Debit || 0);
        const credit = Number(row?.Credit || 0);
        const account = normalizeAccountingReportAccountName(row);
        const type = normalizeAccountingReportType(row?.Type, account);
        if (!account) return;

        if (!balances[account]) balances[account] = { type, amount: 0 };

        if (type === '비용') {
            const amount = debit - credit;
            if (!amount) return;
            balances[account].type = type;
            balances[account].amount += amount;
            exp[account] = (exp[account] || 0) + amount;
            tExp += amount;
            return;
        }

        if (type === '매출' || type === '영업외수익') {
            const amount = credit - debit;
            if (!amount) return;
            balances[account].type = type;
            balances[account].amount += amount;
            if (type === '매출') {
                rev[account] = (rev[account] || 0) + amount;
                tRev += amount;
            } else {
                otherRev[account] = (otherRev[account] || 0) + amount;
                tOtherRev += amount;
            }
        }
    });

    return {
        balances,
        rev,
        exp,
        otherRev,
        tRev,
        tExp,
        tOtherRev,
        netIncome: tRev - tExp + tOtherRev
    };
}

function isClosingCarryforwardRow(row, targetYear) {
    const relatedKey = `CLOSE-${targetYear}`;
    const transId = String(row?.Trans_ID || '').trim();
    const desc = String(row?.Description || '').trim();
    return transId === relatedKey && desc.startsWith('[손익마감]');
}

function getClosingReportPeriodRows(rows, targetYear) {
    return (rows || []).filter((row) => !isClosingCarryforwardRow(row, targetYear));
}

function validateAccountingReportSource(data, selection) {
    const fail = () => { throw Error('ACCOUNTING_REPORT_SOURCE_INCOMPLETE'); };
    if (!data || data.schema_version !== 1 || data.coop_id !== selection.coop || data.fiscal_year !== selection.year || data.period_end !== selection.end) fail();
    const proof = data.proof;
    if (!proof || !Number.isSafeInteger(data.member_count) || data.member_count < 0) fail();
    for (const [field, count] of [['journal_rows', 'journal_count'], ['company_rows', 'company_count'], ['master_rows', 'master_count'], ['salary_rows', 'salary_count']]) {
        if (!Array.isArray(data[field]) || !Number.isSafeInteger(proof[count]) || data[field].length !== proof[count]) fail();
    }
    const start = `${selection.year}-01-01`, totals = { debit: 0, credit: 0, period: 0 };
    for (const row of data.journal_rows) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.Date) || row.Date > selection.end) fail();
        for (const side of ['Debit', 'Credit']) if (!Number.isSafeInteger(Number(row[side] || 0))) fail();
        totals.debit += Number(row.Debit || 0); totals.credit += Number(row.Credit || 0);
        if (row.Date >= start) totals.period++;
    }
    if (!Number.isSafeInteger(totals.debit) || !Number.isSafeInteger(totals.credit) || totals.debit !== Number(proof.debit) || totals.credit !== Number(proof.credit) || totals.period !== proof.period_count) fail();
    return data;
}

 function summarize(data,selection){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(selection.end)||new Date(selection.end).toISOString().slice(0,10)!==selection.end||selection.end.slice(0,4)!==String(selection.year))throw Error('ACCOUNTING_PERIOD');
  if(data?.unit!==undefined&&!['원','KRW',1].includes(data.unit))throw Error('ACCOUNTING_UNIT');
  validateAccountingReportSource(data,selection);
  for(const row of data.journal_rows){
   if(new Date(row.Date).toISOString().slice(0,10)!==row.Date)throw Error('ACCOUNTING_DATE');
   for(const side of ['Debit','Credit'])if(!Object.hasOwn(row,side)||row[side]===''||!Number.isSafeInteger(Number(row[side]||0)))throw Error('ACCOUNTING_AMOUNT');
  }
  const start=selection.year+'-01-01',all=data.journal_rows,period=all.filter(row=>row.Date>=start);
  if(!all.length)return {values:{},missing:['조회기준일까지 등록된 전표가 없습니다.'],start,end:selection.end,empty:true};
  const rows=getClosingReportPeriodRows(period,selection.year),income=buildClosingIncomeSummary(rows),closed=period.some(row=>isClosingCarryforwardRow(row,selection.year));
  let assets=0,liabilities=0,equity=0,capital=0,reserveBalance=0,retained=0,reserveDisposition=0;
  for(const row of all){const account=normalizeAccountingReportAccountName(row),type=normalizeAccountingReportType(row.Type,account),dr=Number(row.Debit)-Number(row.Credit),cr=-dr;
   if(type==='자산')assets+=dr;else if(type==='부채')liabilities+=cr;else if(type==='자본'){equity+=cr;if(account==='출자금')capital+=cr;if(account==='법정적립금')reserveBalance+=cr;if(['이월이익잉여금','미처분이익잉여금','미처리결손금'].includes(account))retained+=cr;}
  }
  for(const row of rows)if(normalizeAccountingReportType(row.Type,normalizeAccountingReportAccountName(row))==='자본'&&normalizeAccountingReportAccountName(row)==='법정적립금')reserveDisposition+=Number(row.Credit);
  const net=income.netIncome,tax=income.exp['법인세비용']||0;
  const values={assets,liabilities,equity:equity+(closed?0:net),capital,reserveBalance,retained:retained+(closed?0:net),revenue:income.tRev,selling:income.tExp,operating:income.tRev-income.tExp,otherRevenue:income.tOtherRev,pretax:net+tax,tax,net,reserveDisposition};
  for(const n of Object.values(values))if(!Number.isSafeInteger(n))throw Error('ACCOUNTING_TOTAL');
  return {values,missing:['매출총손익·영업외비용은 현재 결산보고서에서 별도로 구분되지 않습니다.'],start,end:selection.end,empty:false,hasPeriodRows:period.length>0};
 }
 root.DisclosureFinance=Object.freeze({summarize,version:'1.0.0'});
})(window);
