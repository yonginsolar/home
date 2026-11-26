(function(root){
  'use strict';
  const types=Object.freeze({yes_no:'예/아니요',scale3:'3점 척도',scale5:'5점 척도',scale7:'7점 척도',text:'주관식'});
  const style=document.createElement('link');
  style.rel='stylesheet';style.href='/shared/education_survey_form_v1.css';
  style.integrity='sha384-HbADTbPsskJfKL2GnrhTTeciKyzEaVDoEQgtC87IRLB/epIFswpnbW/iwuwRl/3a';
  style.crossOrigin='anonymous';document.head.append(style);
  function element(tag,text,classes){
    const node=document.createElement(tag);
    if(text)node.textContent=text;
    if(classes)node.className=classes;
    return node;
  }
  function render(container,questions){
    const fields=new Map();
    container.replaceChildren();
    questions.forEach((question,index)=>{
      const group=element('fieldset','','education-survey-question');
      const legend=element('legend',(index+1)+'. '+question.title+(question.required?' (필수)':' (선택)'));
      group.append(legend);container.append(group);
      if(question.type==='text'){
        const input=element('textarea');
        input.rows=3;input.maxLength=1200;input.required=question.required;
        input.setAttribute('aria-label',question.title);
        group.append(input);
        fields.set(question.id,()=>input.value.trim()||undefined);
        return;
      }
      const choices=element('div','','education-survey-choices');
      const isYesNo=question.type==='yes_no';
      const options=isYesNo?['예','아니요']:Array.from({length:Number(question.type.slice(-1))},(_,i)=>String(i+1));
      const inputs=options.map((label,i)=>{
        const wrapper=element('label','','education-survey-choice');
        const radio=element('input');radio.type='radio';radio.name='question-'+question.id;
        radio.value=label;radio.required=question.required&&i===0;
        wrapper.append(radio,element('span',label));choices.append(wrapper);
        return radio;
      });
      group.append(choices);
      fields.set(question.id,()=>{
        const index=inputs.findIndex(input=>input.checked);
        return index<0?undefined:(isYesNo?index===0:index+1);
      });
    });
    return ()=>{
      const answers={};
      for(const [id,read] of fields){
        const value=read();
        if(value!==undefined)answers[id]=value;
      }
      return answers;
    };
  }
  function answerText(question,value){
    if(value===undefined)return '미응답';
    if(question.type==='yes_no')return value?'예':'아니요';
    if(question.type==='text')return String(value);
    return value+' / '+question.type.slice(-1)+'점';
  }
  function previewLegacy(container,prompt){
    const rating=element('label',prompt?.rating_label||'교육은 어떠셨나요?','d-block fw-bold mb-1');
    const select=element('select','','form-select mb-2');
    for(const [value,caption] of ['선택','많이 아쉬웠어요 (1)','아쉬웠어요 (2)','보통이에요 (3)','좋았어요 (4)','매우 좋았어요 (5)'].entries()){
      const option=element('option',caption);option.value=value||'';select.append(option);
    }
    rating.append(select);
    const comment=element('label',(prompt?.comment_label||'의견')+' (선택)','d-block fw-bold');
    const textarea=element('textarea','','form-control');textarea.rows=4;comment.append(textarea);
    container.append(rating,comment);
  }
  root.CoopEducationSurveyForm=Object.freeze({types,render,previewLegacy,answerText});
})(window);
