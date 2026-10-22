import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import ts from 'typescript';

test('native ESM entry loads shared ESM modules and fails closed without contacting providers',async()=>{
 const root=fileURLToPath(new URL('..',import.meta.url));
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'txkpro-research-runtime-'));
 const prior=process.env.MARKETING_RESEARCH_ENABLED;
 try{
  fs.symlinkSync(path.join(root,'node_modules'),path.join(tmp,'node_modules'),'dir');
  for(const file of ['lib/research/http.ts','lib/research/service.ts','lib/research/contract.ts','lib/research/calendar.ts','lib/email/twilio-email.ts','lib/supabase/server-secret.ts']){
   const dest=path.join(tmp,file.replace('.ts','.js'));fs.mkdirSync(path.dirname(dest),{recursive:true});
   fs.writeFileSync(dest,ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
  }
  for(const dir of ['lib/research','lib/email','lib/supabase'])fs.copyFileSync(path.join(root,dir,'package.json'),path.join(tmp,dir,'package.json'));
  const q=path.join(tmp,'marketing/research/questions.json');fs.mkdirSync(path.dirname(q),{recursive:true});fs.copyFileSync(path.join(root,'marketing/research/questions.json'),q);
  process.env.MARKETING_RESEARCH_ENABLED='false';
  for(const [site,origin]of [['workforce','https://workforce.txkpro.com'],['marketplace','https://txkpro.com']]){
   const entry=path.join(tmp,`marketing/${site}/api/research.mjs`);fs.mkdirSync(path.dirname(entry),{recursive:true});
   fs.writeFileSync(entry,ts.transpileModule(fs.readFileSync(path.join(root,`marketing/${site}/api/research.ts`),'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
   const app=(await import(pathToFileURL(entry).href)).default;
   const response=await app.fetch(new Request(origin+'/api/research?action=availability'));
   assert.equal(response.status,503);assert.equal(response.headers.get('location'),null);assert.equal(response.headers.get('cache-control'),'no-store');
   assert.equal((await app.fetch(new Request(origin+'/api/research?action=availability',{headers:{Origin:'https://attacker.invalid'}}))).status,403);
   assert.equal((await app.fetch(new Request(origin+'/api/research',{method:'DELETE'}))).status,405);
  }
 }finally{
  if(prior===undefined)delete process.env.MARKETING_RESEARCH_ENABLED;else process.env.MARKETING_RESEARCH_ENABLED=prior;
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});
