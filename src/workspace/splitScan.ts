export type CandidateRange = { candidate: string; first: number; last: number };
export function parseCandidateRanges(text: string, pageCount: number): CandidateRange[] {
  const rows = text.trim().split(/\r?\n/).filter(line => line.trim());
  if (!rows.length || rows.length > 30) throw new Error('Enter 1–30 candidate ranges, one per line.');
  const used = new Set<number>(); const candidates = new Set<string>();
  const ranges = rows.map((line, index) => {
    const match = line.trim().match(/^([^,]+),\s*(\d+)\s*-\s*(\d+)$/);
    if (!match) throw new Error(`Line ${index + 1}: use candidate number, first-last page.`);
    const candidate = match[1].trim(); const first = Number(match[2]); const last = Number(match[3]);
    if (!candidate || candidate.length > 100 || /[<>:"/\\|?*\u0000-\u001f]/.test(candidate)) throw new Error(`Line ${index + 1}: invalid candidate number.`);
    if (candidates.has(candidate.toLowerCase())) throw new Error(`Candidate ${candidate} appears more than once.`);
    candidates.add(candidate.toLowerCase());
    if (first < 1 || last < first || last > pageCount) throw new Error(`Line ${index + 1}: select pages between 1 and ${pageCount}.`);
    for (let page = first; page <= last; page++) { if (used.has(page)) throw new Error(`Page ${page} is assigned more than once.`); used.add(page); }
    return { candidate, first, last };
  });
  if (used.size !== pageCount) throw new Error(`${pageCount - used.size} page(s) are unassigned. Assign every page before splitting.`);
  return ranges;
}
export async function splitScan(file: File, text: string): Promise<File[]> {
  if (!file.size || file.size > 59 * 1024 * 1024 || !file.name.toLowerCase().endsWith('.pdf')) throw new Error('Use a combined PDF up to 59 MB.');
  const { PDFDocument } = await import('pdf-lib');
  const source = await PDFDocument.load(await file.arrayBuffer());
  const ranges = parseCandidateRanges(text, source.getPageCount());
  const output: File[] = [];
  for (const range of ranges) {
    const target = await PDFDocument.create();
    const pages = await target.copyPages(source, Array.from({ length: range.last - range.first + 1 }, (_, i) => range.first - 1 + i));
    pages.forEach(page => target.addPage(page));
    const data = await target.save();
    if (data.length > 10 * 1024 * 1024) throw new Error(`Candidate ${range.candidate} exceeds 10 MB. Compress the scan before splitting.`);
    output.push(new File([data], `${range.candidate}.pdf`, { type: 'application/pdf' }));
  }
  return output;
}
