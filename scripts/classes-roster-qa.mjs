import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {csvRows,validateRoster,assertSafeXlsx} from "../lib/classes/roster.ts";
import {directoryGraph,NODE_WIDTH,NODE_HEIGHT} from "../lib/classes/directory-graph.ts";

test("directory filters, shared classes and collapsed branches preserve scoped connections",()=>{
 const person=(cohortId,role="instructor")=>({userId:"staff",name:"Instructor",role,scopeType:"cohort",scopeId:cohortId,institutionId:"ins",institutionName:"College",cohortId,cohortName:cohortId,program:"Electrical"});
 const item={classId:"class",institutionId:"ins",name:"Shared class",courseName:"Safety",status:"open",instructors:[],cohorts:[{cohortId:"a",name:"a",program:"Electrical"},{cohortId:"b",name:"b",program:"Electrical"}]};
 const data={people:[person("a"),person("a"),person("b","program_coordinator")],classes:[item],assistance:[]};
 const all=directoryGraph(data,"","",new Set());
 assert.equal(all.nodes.filter(n=>n.kind==="staff").length,2);
 assert.equal(all.nodes.filter(n=>n.kind==="class").length,2);
 assert.equal(new Set(all.nodes.map(n=>n.id)).size,all.nodes.length);
 const filtered=directoryGraph(data,"instructor","a",new Set());
 assert.equal(filtered.nodes.filter(n=>n.kind==="staff").length,1);
 assert.equal(filtered.nodes.some(n=>n.id==="cohort:b"),false);
 assert.equal(filtered.nodes.some(n=>n.kind==="class"),false);
 const collapsed=directoryGraph(data,"","",new Set(["cohort:a"]));
 assert.equal(collapsed.nodes.some(n=>n.id.startsWith("cohort:a:")),false);
 assert.equal(collapsed.nodes.some(n=>n.id.startsWith("cohort:b:")),true);
 for(const graph of [all,filtered,collapsed]) {
  const ids=new Set(graph.nodes.map(n=>n.id));
  for(const e of graph.edges) assert.ok(ids.has(e.from.id)&&ids.has(e.to.id));
  for(const n of graph.nodes) assert.ok(n.x>=0&&n.y>=0&&n.x+NODE_WIDTH<=graph.width&&n.y+NODE_HEIGHT<=graph.height);
 }
 assert.deepEqual(directoryGraph({people:[],classes:[],assistance:[]},"","",new Set()).nodes,[]);
});
test("CSV quoting, BOM and normalized headers",()=>{
 const rows=validateRoster(csvRows('\uFEFFemail,first_name,last_name\r\nTEST@EXAMPLE.COM,"Ada, Jr",Lovelace'));
 assert.equal(rows[0].email,"test@example.com");assert.equal(rows[0].firstName,"Ada, Jr");assert.equal(rows[0].error,undefined);
});
test("duplicates and malformed entries are flagged",()=>{
 const rows=validateRoster(csvRows("email,first_name\na@example.com,A\nA@example.com,B\ninvalid,C\nx@example.com,=formula"));
 assert.equal(rows[0].error,undefined);assert.match(rows[1].error,/Duplicate/);assert.match(rows[2].error,/email/);assert.match(rows[3].error,/Invalid/);
});
test("header/quote/row limits enforced",()=>{
 assert.throws(()=>validateRoster([["first_name"],["Ada"]]),/email/);
 assert.throws(()=>validateRoster([["email","EMAIL"],["a@b.com","a@b.com"]]),/unique/);
 assert.throws(()=>csvRows('email\n"not closed'),/unclosed/);
 assert.throws(()=>validateRoster([["email"],...Array.from({length:1001},()=>["a@b.com"])]),/1,000/);
});
test("real Excel workbook accepted; malformed and lying ZIP rejected",async()=>{
 const workbook=new ExcelJS.Workbook();const sheet=workbook.addWorksheet("Roster");sheet.addRow(["email","first_name"]);sheet.addRow(["a@example.com","Ada"]);
 const bytes=new Uint8Array(await workbook.xlsx.writeBuffer());assert.doesNotThrow(()=>assertSafeXlsx(bytes));
 assert.throws(()=>assertSafeXlsx(new Uint8Array([0,1,2])),/standard/);
 const altered=bytes.slice();const view=new DataView(altered.buffer);for(let i=0;i<altered.length-46;i++)if(view.getUint32(i,true)===0x02014b50){view.setUint32(i+24,1,true);break;}
 assert.throws(()=>assertSafeXlsx(altered),/mismatch/);
});
