import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { parseCandidateRanges, splitScan } from './splitScan';
describe('Combined scan splitting', () => {
  it.each([
    ['C001, 1-2\nC002, 2-4','assigned more than once'],
    ['C001, 1-2','unassigned'],
    ['C001, 1-2\nc001, 3-4','more than once'],
    ['C001, 0-4','between 1 and 4'],
  ])('rejects unsafe page allocations: %s', (text,message) => {
    expect(()=>parseCandidateRanges(text,4)).toThrow(message);
  });
  it('extracts the requested candidate pages into valid separate PDFs', async () => {
    const source=await PDFDocument.create(); for(let i=0;i<4;i++) source.addPage([400+i,500]);
    const data=await source.save(); const file=new File([data],'combined.pdf',{type:'application/pdf'});
    Object.defineProperty(file,'arrayBuffer',{value:async()=>data.buffer});
    const files=await splitScan(file,'C001, 1-2\nC002, 3-4');
    expect(files.map(f=>f.name)).toEqual(['C001.pdf','C002.pdf']);
    const read=(file:File)=>new Promise<ArrayBuffer>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.onerror=reject;reader.readAsArrayBuffer(file);});
    const first=await PDFDocument.load(await read(files[0])); const second=await PDFDocument.load(await read(files[1]));
    expect(first.getPageCount()).toBe(2); expect(first.getPage(0).getWidth()).toBe(400);
    expect(second.getPageCount()).toBe(2); expect(second.getPage(0).getWidth()).toBe(402);
  });
});
