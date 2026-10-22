(() => {
 const forms=document.querySelectorAll('[data-research-form]');
 for(const form of forms){
  const api=form.dataset.researchApi;
  const status=form.querySelector('[data-research-status]');
  const submit=form.querySelector('[type=submit]');
  const kind=form.dataset.researchForm;
  let requestId=crypto.randomUUID();let unsubscribeToken='';let completed=false;
  const message=text=>{status.textContent=text;};
  if(kind==='unsubscribe'){
   unsubscribeToken=new URLSearchParams(location.hash.slice(1)).get('token')||'';
   if(unsubscribeToken){
    history.replaceState(null,'',location.pathname);
    form.querySelector('[data-preferences-request]').hidden=true;
    form.querySelector('[name=email]').required=false;
    form.querySelector('[data-preferences-confirm]').hidden=false;
    submit.textContent='Stop Workforce marketing updates';
   }
  }
  const call=async(action,body)=>{
   if(!api)throw Error('This form is temporarily unavailable. Please check back soon.');
   const response=await fetch(api+'?action='+action,{method:body?'POST':'GET',...(body?{headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(kind==='booking'?90000:25000),cache:'no-store'});
   const result=await response.json();
   if(!response.ok||result.ok===false)throw Error(result.error||'Unable to complete this request. Please try again later.');
   return result;
  };
  if(kind==='booking'){
   const token=new URLSearchParams(location.hash.slice(1)).get('calendar');
   if(token){
    history.replaceState(null,'',location.pathname);
    for(const child of [...form.children])child.hidden=true;
    status.hidden=false;
    const download=document.createElement('button');download.type='button';download.className='button blue';download.textContent='Download calendar file';download.disabled=!api;
    download.addEventListener('click',async()=>{
     download.disabled=true;
     try{const result=await call('calendar',{token});const url=URL.createObjectURL(new Blob([result.calendar],{type:'text/calendar'}));const a=document.createElement('a');a.href=url;a.download='txkpro-research-interview.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);message('Calendar file downloaded. Open it in your calendar app.');}catch(error){message(error.message);}finally{download.disabled=!api;}
    });
    form.append(download);continue;
   }
  }
  if(kind==='survey'){
   let questions;
   const select=form.querySelector('[name=role]');
   const container=form.querySelector('[data-survey-questions]');
   const render=()=>{
    container.replaceChildren();requestId=crypto.randomUUID();
    for(const [index,q] of (questions?.[select.value]||[]).entries()){
     const label=document.createElement('label');label.textContent=(index+1)+'. '+q.text;
     const answer=document.createElement('select');answer.name='answer:'+q.id;answer.required=true;
     answer.add(new Option('Choose an answer',''));
     for(const option of q.options)answer.add(new Option(option,option));
     label.append(answer);container.append(label);
    }
   };
   select.addEventListener('change',render);
   fetch('/assets/research-questions.json').then(r=>{if(!r.ok)throw Error('questions');return r.json();}).then(data=>{
    questions=data;const role=new URLSearchParams(location.search).get('role');
    if(Object.hasOwn(data,role))select.value=role;render();
   }).catch(()=>{submit.disabled=true;message('Survey questions could not be loaded. Please refresh.');});
  }
  if(kind==='booking'){
   const date=form.querySelector('[data-booking-date]');
   const chicago=d=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
   date.min=chicago(new Date(Date.now()+86400000));date.max=chicago(new Date(Date.now()+30*86400000));
   for(let offset=1;offset<=4;offset++){const day=new Date(Date.now()+offset*86400000);if(!['Sat','Sun'].includes(new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short'}).format(day))){date.value=chicago(day);break;}}
   date.addEventListener('change',()=>{form.querySelector('[data-time-slots]').replaceChildren(new Option('Check availability first',''));});
   const load=form.querySelector('[data-load-availability]');
   load.addEventListener('click',async()=>{
    load.disabled=true;message('Checking live calendar availability…');
    const date=form.querySelector('[data-booking-date]');
    if(!date.reportValidity()){load.disabled=false;return;}
    const select=form.querySelector('[data-time-slots]');select.replaceChildren(new Option('Choose a time',''));
    try{
     const selected=date.value;
     const result=await call('availability&date='+encodeURIComponent(selected));
     if(date.value!==selected){message('Date changed. Check available times again.');return;}
     for(const slot of result.slots)select.add(new Option(slot.label+' (Chicago time)',slot.start));
     message(result.slots.length?'Choose a time, then confirm your interview.':'No times are currently available. Please check back later.');
    }catch(error){message(error.message);}finally{load.disabled=false;}
   });
  }
  form.addEventListener('submit',async event=>{
   event.preventDefault();if(completed||!form.reportValidity())return;
   submit.disabled=true;message('Submitting…');
   const values=new FormData(form);let action=kind;let body;
   if(kind==='survey')body={requestId,role:values.get('role'),answers:Object.fromEntries([...values].filter(([key])=>key.startsWith('answer:')).map(([key,value])=>[key.slice(7),value])),website:values.get('website')};
   else if(kind==='booking')body={requestId,role:values.get('role'),firstName:values.get('firstName'),email:values.get('email'),start:values.get('start'),consent:values.get('consent')==='on',website:values.get('website')};
   else {action=unsubscribeToken?'unsubscribe_confirm':'unsubscribe_request';body=unsubscribeToken?{token:unsubscribeToken}:{email:values.get('email'),website:values.get('website')};}
   try{
    const result=await call(action,body);message(result.message);
    if(kind==='booking'&&result.receipt!=='accepted')message(result.message+' Confirmation email delivery is pending. Contact TXKPRO before submitting another booking.');
    if(kind==='booking'&&result.calendarLink){const a=document.createElement('a');a.href=result.calendarLink;a.textContent='Add interview to your calendar';a.className='button secondary';form.append(a);}
    completed=true;submit.textContent='Submitted';
   }catch(error){message(error.name==='TimeoutError'?'The response timed out. Keep this page open and retry the same request; do not make a second booking.':error.message);submit.disabled=false;}
  });
 }
})();
