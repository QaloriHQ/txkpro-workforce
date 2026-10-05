import test from 'node:test';
import assert from 'node:assert/strict';
import {activityCsv,csvCell} from '../lib/pro-points/csv.ts';
test('activity exports neutralize formulas with leading whitespace and control characters',()=>{
 for(const value of ['=SUM(A1:A2)',' +cmd','@SUM(1)','-2+3','\t=cmd','\r=cmd','\n=cmd'])assert.equal(csvCell(value),'"\''+value+'"');
});
test('activity exports retain quoted names, Unicode, participation and score separately',()=>{
 const csv=activityCsv([{name:'José, "Student"\nTwo',kind:'sponsored_student',status:'active',points:25,approved:2}]);
 assert.ok(csv.startsWith('\ufeff"Participant"'));assert.ok(csv.includes('"José, ""Student""\nTwo"'));assert.ok(csv.includes('"sponsored_student","active","25","2"'));assert.equal(csvCell(null),'""');
});
