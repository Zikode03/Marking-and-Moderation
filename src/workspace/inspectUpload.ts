import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
export type FileInspection = { pages: number; hash: string };
export async function inspectUpload(file: File): Promise<FileInspection> {
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Use a non-empty file up to 10 MB.');
  if (file.name.length > 200) throw new Error('Shorten the filename to 200 characters or fewer.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const extension = file.name.split('.').pop()?.toLowerCase();
  const pdf = new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  const png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!(pdf && extension === 'pdf' || png && extension === 'png' || jpeg && ['jpg', 'jpeg'].includes(extension || ''))) throw new Error('The file contents do not match a PDF, PNG or JPEG filename.');
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map(b => b.toString(16).padStart(2, '0')).join('');
  let pages = 1;
  if (pdf) {
    const library = await import('pdfjs-dist'); library.GlobalWorkerOptions.workerSrc = workerUrl;
    const task = library.getDocument({ data: bytes });
    try { pages = (await task.promise).numPages; if (pages > 1000) throw new Error('Split documents longer than 1,000 pages.'); }
    finally { await task.destroy(); }
  } else {
    const url = URL.createObjectURL(file);
    try { await new Promise<void>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(); image.onerror = () => reject(new Error('The image cannot be read. Replace it with a clear scan.')); image.src = url; }); }
    finally { URL.revokeObjectURL(url); }
  }
  return { pages, hash };
}
