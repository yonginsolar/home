(function (root) {
  'use strict';
  // Keep the same bank mapping as the existing public deposit guide.
  function supportedAccount(account) {
    return /^(신협|신용협동조합)$/.test(String(account?.bank || '').trim())
      && /^[0-9\s-]+$/.test(String(account?.account || ''))
      && /^[0-9]{8,30}$/.test(String(account?.account || '').replace(/[\s-]/g,''))
      && Boolean(String(account?.holder || '').trim());
  }
  function url(account, amount) {
    const value=String(amount);
    if (!supportedAccount(account)||!/^\d{1,10}$/.test(value)||Number(value)<1||Number(value)>1000000000) return '';
    const fields=new URLSearchParams({bankCode:'048',accountNo:String(account.account).replace(/[\s-]/g,''),
      amount:String(Number(value)),origin:'link'});
    return 'supertoss://send?'+fields;
  }
  root.CoopCapitalToss=Object.freeze({supportedAccount,url});
})(window);
