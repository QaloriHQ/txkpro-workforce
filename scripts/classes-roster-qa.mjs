import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {csvRows,validateRoster,assertSafeXlsx} from "../lib/classes/roster.ts";
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
