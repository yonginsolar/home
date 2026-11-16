/* 배당만 법인유형으로 제한한다. 출자금·결산·기존 자료는 삭제하지 않는다. */
(()=>{
 'use strict';
 const blockedTabs=new Set(['#sub-tab-dividends','#sub-tab-dividend-batches','#sub-tab-dividend-exports']);
 const allowed=()=>typeof canUseAdminMemberDividends==='function'&&canUseAdminMemberDividends();
 const entries=['fetchGlobalDividends','loadDividendCalculationSettings','saveDividendCalculationSettings','fetchDividendCapitalBasisSummary','refreshDividendCapitalPoolPreview','initializeDividendBatchTab','fetchDividendManageBatches','fetchDividendBatchItemsPreview','fetchDividendGeneralAssemblyMinutes','selectDividendManageBatch','createDividendBatch','runDividendCapitalCalculation','runDividendUsageCalculation','approveSelectedDividendBatch','finalizeSelectedDividendBatch','initializeDividendExportTab','fetchDividendExportBatches','selectDividendExportBatch','fetchDividendPaymentState','loadDividendExportRows','downloadDividendBankTransferXlsx','cancelSelectedDividendPaymentRun','confirmSelectedDividendPaymentRun','dispatchDividendKakaoNotifications','dispatchSelectedDividendNotifications','downloadDividendTaxLedgerXlsx','downloadDividendHometaxPaymentStatementCsv','downloadDividendWithholdingSummaryCsv','openDividendModal','submitDividendGrant','readDividendExcel','submitDividendBatch'];
 for(const name of entries){const original=window[name];if(typeof original!=='function')continue;window[name]=function(...args){if(!allowed())return Promise.resolve(null);return original.apply(this,args);};}
 const calculate=window.calculateDividendCapitalPoolFromRate;
 if(typeof calculate==='function')window.calculateDividendCapitalPoolFromRate=function(...args){if(!allowed())throw Error('현재 조합은 배당을 계산할 수 없습니다.');return calculate.apply(this,args);};
 document.addEventListener('show.bs.tab',event=>{if(blockedTabs.has(event.target?.getAttribute('data-bs-target'))&&!allowed())event.preventDefault();});
 window.DividendPolicy=Object.freeze({allowed});
})();
