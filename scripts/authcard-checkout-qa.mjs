import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {setupProgress,requestProgress} from '../lib/authcard/contracts.ts';
const require=createRequire(import.meta.url);
function checkoutFixture({canResume=true,valid=true}={}) {
 const state=[],effects=[],calls=[];let cursor=0,initialized=false,paid=false;
 const ContactDetailsElement=()=>null,PaymentElement=()=>null;
 const checkout={canConfirm:false,total:{total:{amount:'$5.00'}},validateElements:async()=>{calls.push('validate');return valid?{type:'success'}:{type:'error',error:{message:'Enter your receipt email.'}};},confirm:async()=>{calls.push('confirm');paid=true;return {type:'success'};}};
 const react={useMemo:fn=>fn(),useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=value;}];},useEffect:fn=>{if(!initialized)effects.push(fn);}};
 const mod={exports:{}};
 const code=ts.transpileModule(readFileSync(new URL('../components/screening/checkout.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText+'\nmodule.exports.testPayment=Payment;';
 new Function('require','module','exports','fetch',code)(name=>name==='react'?react:name==='@stripe/stripe-js'?{loadStripe:()=>null}:name==='@stripe/react-stripe-js/checkout'?{ContactDetailsElement,PaymentElement,useCheckoutElements:()=>({type:'success',checkout})}:require(name),mod,mod.exports,async()=>({ok:true,json:async()=>({canResume:!paid&&canResume,message:paid?'Confirmed':'Resume same payment'})}));
 const props={apiPath:'/api/authcard',orderId:'kyu',ownerType:'',ownerId:'',onBusy:()=>{},onDone:()=>calls.push('reconcile'),onResume:()=>calls.push('resume')};
 function render(){cursor=0;return mod.exports.testPayment(props);}
 return {render,checkout,calls,state,ContactDetailsElement,PaymentElement,async initialize(){render();initialized=true;effects.forEach(fn=>fn());await new Promise(r=>setImmediate(r));}};
}
function flatten(node){if(!node||typeof node!=='object')return [];return [node,...[node.props?.children].flat(Infinity).flatMap(flatten)];}
test('checkout exposes receipt contact and permits SDK validation instead of a permanently disabled Pay button',async()=>{
 const f=checkoutFixture({valid:false});await f.initialize();const form=f.render(),nodes=flatten(form);
 assert.ok(nodes.some(n=>n.type===f.ContactDetailsElement));assert.ok(nodes.some(n=>n.type===f.PaymentElement));
 assert.equal(nodes.find(n=>n.type==='button'&&n.props.type==='submit').props.disabled,false);
 await form.props.onSubmit({preventDefault(){}});assert.deepEqual(f.calls,['validate']);assert.equal(f.state[4],'Enter your receipt email.');
});
test('completed contact/payment fields confirm once and reconcile provider status; repeated submit is blocked',async()=>{
 const f=checkoutFixture();await f.initialize();f.checkout.canConfirm=true;
 await f.render().props.onSubmit({preventDefault(){}});assert.deepEqual(f.calls,['validate','confirm','reconcile']);
 await f.render().props.onSubmit({preventDefault(){}});assert.equal(f.calls.filter(c=>c==='confirm').length,1);
});
test('provider-disallowed resume cannot validate or confirm a charge',async()=>{
 const f=checkoutFixture({canResume:false});await f.initialize();await f.render().props.onSubmit({preventDefault(){}});assert.deepEqual(f.calls,[]);
});
test('progress uses confirmed prerequisites and clears current completion after holds or revocation',()=>{
 const card={status:'not_started',ready:false,paid:false,requests:[]};assert.equal(setupProgress(card).filter(s=>s.complete).length,0);
 assert.equal(setupProgress({...card,ready:true}).filter(s=>s.complete).length,1);
 assert.equal(setupProgress({...card,ready:true,paid:true,status:'processing'}).filter(s=>s.complete).length,2);
 assert.equal(setupProgress({...card,ready:true,paid:true,status:'verified'}).filter(s=>s.complete).length,3);
 assert.equal(setupProgress({...card,ready:true,status:'verified'}).find(s=>s.id==='identity').complete,false);
 assert.equal(setupProgress({...card,paid:true,status:'verified'}).find(s=>s.id==='identity').complete,false);
 const request={status:'shared',consent:'authorized'};
 assert.equal(requestProgress(request).every(s=>s.complete),true);
 for(const r of [{...request,status:'revoked'},{...request,status:'declined'}])assert.equal(requestProgress(r).some(s=>s.complete),false);
 assert.equal(requestProgress({...request,consent:'changed'}).find(s=>s.id==='authorization').complete,false);
});
function authCardFixture({status='requires_input',ready=true,paid=true,fail=false}={}) {
 const state=[],effects=[],calls=[],timers=[];let cursor=0;
 const ActionModal=()=>null;
 const react={useState:initial=>{const i=cursor++;if(!(i in state))state[i]=initial;return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value;}];},useEffect:fn=>effects.push(fn)};
 const initial={status,ready,paid,name:'Fixture',requests:[]};
 const mod={exports:{}};const code=ts.transpileModule(readFileSync(new URL('../components/authcard/workspace.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
 new Function('require','module','exports','fetch','setTimeout','clearTimeout',code)(name=>name==='react'?react:name==='next/dynamic'?()=>()=>null:name==='@stripe/stripe-js'?{loadStripe:async()=>null}:name==='@/components/design-system/action-modal'?{ActionModal}:name==='@/lib/authcard/contracts'?{setupProgress,requestProgress,PURPOSES:[]}:require(name),mod,mod.exports,async(_,{body})=>{const {op}=JSON.parse(body);calls.push(op);return {ok:!fail,json:async()=>fail?{error:'Results access needs support.'}:op==='workspace'?{...initial,status:'verified'}:{message:'Synchronized'}};},fn=>{timers.push(fn);return timers.length;},()=>{});
 function render(){cursor=0;effects.length=0;return mod.exports.AuthCardWorkspace({initial,configured:true});}
 return {render,effects,calls,timers,state,ActionModal};
}
test('progress actions open the corresponding existing form and respect prerequisites',()=>{
 const f=authCardFixture({ready:false,paid:false});let nodes=flatten(f.render());const progress=nodes.find(n=>n.props.label==='AuthCard setup progress');
 assert.equal(progress.props.actions.payment.props.disabled,true);assert.equal(flatten(progress.props.actions.identity).find(n=>n.type==='button').props.disabled,true);
 progress.props.actions.details.props.onClick();nodes=flatten(f.render());assert.equal(nodes.find(n=>n.type===f.ActionModal&&n.props.title==='Private screening information').props.openSignal,1);
 const paid=authCardFixture();const p=flatten(paid.render()).find(n=>n.props.label==='AuthCard setup progress');p.props.actions.payment.props.onClick();assert.equal(flatten(paid.render()).find(n=>n.type===paid.ActionModal&&n.props.title==='KYU invoice & receipt').props.openSignal,1);
 flatten(p.props.actions.identity).find(n=>n.type==='button').props.onClick();assert.equal(flatten(paid.render()).find(n=>n.type===paid.ActionModal&&n.props.title==='KYU identity verification').props.openSignal,1);
});
test('returning to pending AuthCard reconciles provider then reloads verified progress automatically',async()=>{
 const f=authCardFixture();f.render();f.effects.forEach(fn=>fn());await new Promise(r=>setImmediate(r));assert.deepEqual(f.calls,['refresh','workspace']);assert.equal(f.state[0].status,'verified');assert.equal(f.timers.length,0);
 const failed=authCardFixture({fail:true});failed.render();failed.effects.forEach(fn=>fn());await new Promise(r=>setImmediate(r));assert.equal(failed.state[0].status,'requires_input');assert.equal(failed.state[2],'Results access needs support.');assert.equal(failed.timers.length,0);
});
