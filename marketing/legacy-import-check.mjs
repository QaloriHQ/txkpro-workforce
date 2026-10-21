// Offline reconciliation only. Private exports must stay outside tracked source.
import fs from 'node:fs';
import crypto from 'node:crypto';
const filename=process.argv[2];
if(!filename)throw new Error('Provide an exported JSON manifest path. No database writes are performed.');
const manifest=JSON.parse(fs.readFileSync(filename,'utf8'));
if(!Array.isArray(manifest.sources)||!manifest.sources.length)throw new Error('Missing source inventory');
const keys=new Set();let total=0;
for(const source of manifest.sources){
 if(typeof source.document!=='string'||!source.document||source.document.length>300||!Array.isArray(source.records)||source.expectedCount!==source.records.length)throw new Error('Source ID/count does not reconcile');
 for(const row of source.records){
  if(!row||typeof row.rowKey!=='string'||!row.rowKey||row.rowKey.length>200||!['signup','survey','interview','consent','other'].includes(row.kind)||!row.payload||typeof row.payload!=='object'||Array.isArray(row.payload))throw new Error('Invalid record mapping');
  const key=source.document+'\n'+row.rowKey;if(keys.has(key))throw new Error('Duplicate source row');keys.add(key);
  const hash=crypto.createHash('sha256').update(JSON.stringify(row.payload)).digest('hex');
  if(row.sha256&&row.sha256!==hash)throw new Error('Source hash mismatch');
  total++;
 }
}
console.log(JSON.stringify({sources:manifest.sources.length,records:total,countsReconciled:true,databaseWrites:0,consentConversion:'none; source evidence preserved only'}));
