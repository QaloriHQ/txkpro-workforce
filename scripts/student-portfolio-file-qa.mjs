import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validatePortfolioFile,maxPortfolioFileBytes} from '../lib/student-portfolio/file-validation.ts';
const bytes=s=>new TextEncoder().encode(s);
test('safe raster/PDF/text types are checked against bytes',()=>{validatePortfolioFile(Uint8Array.from([137,80,78,71,13,10,26,10]),'image/png','photo');validatePortfolioFile(bytes('%PDF-1.7'),'application/pdf','resume');validatePortfolioFile(bytes('Resume'),'text/plain','document');});
test('spoofed MIME, SVG/HTML, null bytes, oversized uploads and document-as-photo are rejected',()=>{for(const [body,mime,kind] of [[bytes('<svg/>'),'image/png','photo'],[bytes('<svg/>'),'image/svg+xml','photo'],[bytes('html'),'text/html','document'],[Uint8Array.from([0]),'text/plain','document'],[bytes('%PDF-1.7'),'application/pdf','cover'],[new Uint8Array(maxPortfolioFileBytes+1),'text/plain','resume']])assert.throws(()=>validatePortfolioFile(body,mime,kind));});
