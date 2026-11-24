/* Salary-only print override; use the existing formatter, popup and pay data unchanged. */
(function(root){
    'use strict';
    const signoff= `
      .salary-sig .salary-sig-row {
        display:grid; align-items:center; position:relative;
        width:max-content; max-width:122mm; min-height:22mm; margin-inline:auto;
      }
      .salary-sig .salary-sig-chair {
        display:block; max-width:100%; min-width:0; text-align:center; overflow-wrap:anywhere;
      }
      .salary-sig .salary-sig-seal {
        position:absolute; left:calc(100% - .4mm); top:50%; transform:translateY(-50%);
      }`;
    function print(data,reservedWindow){
        const view=Object.create(PrintService);
        view.styles={...PrintService.styles,salary:PrintService.styles.salary+signoff};
        return view.printSalary(data,reservedWindow);
    }
    root.SalarySlipPrint=Object.freeze({version:'1.0.0',print});
})(window);
