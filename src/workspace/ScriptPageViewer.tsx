import { useEffect, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { request } from '../auth/session';
import { annotationLabels } from './markingLanguages';
import type { ScriptAnnotation } from './AiBatchReview';

export default function ScriptPageViewer({ batchId = '', scriptId = '', annotations, focusPage = 1, focusRequest = 0, file, title = 'Original handwritten script' }: { batchId?: string; scriptId?: string; annotations: ScriptAnnotation[]; focusPage?: number; focusRequest?: number; file?: File; title?: string }) {
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null); const [page, setPage] = useState(1); const [image, setImage] = useState('');
  const [zoom, setZoom] = useState(1); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [imageSource, setImageSource] = useState('');
  useEffect(() => { setPage(focusPage); }, [focusPage, focusRequest]);
  useEffect(() => {
    const controller = new AbortController(); let url = ''; let document: PDFDocumentProxy | null = null; let task: { destroy: () => Promise<void> } | null = null;
    setError(''); setLoading(true); setPdf(null); setImage(''); setImageSource('');
    void (async () => {
      const blob = file || await request<Blob>(`/api/ai/batches/${batchId}/files/${scriptId}`, { signal: controller.signal, headers: { Accept: 'application/octet-stream' } });
      if (controller.signal.aborted) return;
      if (blob.type === 'application/pdf') {
        const library = await import('pdfjs-dist'); library.GlobalWorkerOptions.workerSrc = workerUrl;
        if (controller.signal.aborted) return;
        const loadingTask = library.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }); task = loadingTask;
        document = await loadingTask.promise;
        if (controller.signal.aborted) { await loadingTask.destroy(); return; }
        if (document.numPages > 1000) throw new Error('This document exceeds the 1,000-page review limit.');
        setPdf(document);
      } else if (blob.type.startsWith('image/')) {
        url = URL.createObjectURL(blob); setImageSource(url); setLoading(false);
      } else throw new Error('Preview supports PDF, PNG and JPEG scripts.');
    })().catch(cause => { if (!controller.signal.aborted) { setError(cause instanceof Error ? cause.message : 'Could not open the script.'); setLoading(false); } });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); void task?.destroy().catch(() => {}); };
  }, [batchId, scriptId, file]);
  useEffect(() => {
    if (!pdf) return;
    let cancelled = false; let render: RenderTask | null = null;
    setLoading(true); setImage('');
    void (async () => {
      if (page < 1 || page > pdf.numPages) throw new Error('The review location refers to a page outside this script.');
      const pdfPage = await pdf.getPage(page); if (cancelled) return;
      const original = pdfPage.getViewport({scale: 1}); const scale = Math.min(1.8, 2400 / Math.max(original.width, original.height));
      const viewport = pdfPage.getViewport({scale}); const canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
      render = pdfPage.render({canvas, viewport}); await render.promise;
      if (!cancelled) { setImage(canvas.toDataURL('image/png')); setLoading(false); setError(''); }
    })().catch(cause => { if (!cancelled) { setError(cause instanceof Error ? cause.message : 'Could not render this page.'); setLoading(false); } });
    return () => { cancelled = true; render?.cancel(); };
  }, [pdf, page]);
  const pageCount = pdf?.numPages || 1; const source = imageSource || image;
  const pageError = !loading && (pdf || imageSource) && (page < 1 || page > pageCount);
  return <section className="script-viewer" aria-label={`${title} viewer`}><div className="ai-file-actions">
    <button className="secondary" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous page</button><span>Page {page} / {pageCount}</span><button className="secondary" disabled={page >= pageCount} onClick={() => setPage(p => p + 1)}>Next page</button>
    <label>Zoom<select value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[1, 1.5, 2, 3].map(value => <option key={value} value={value}>{Math.round(value * 100)}%</option>)}</select></label>
  </div>
    {loading && <p role="status">Loading script page…</p>}{error && <p role="alert" className="alert error">{error}</p>}
    {pageError && <p role="alert" className="alert error">The review location refers to a page outside this script. <button className="secondary" onClick={() => setPage(1)}>Return to page 1</button></p>}
    {!!source && !loading && !error && !pageError && <div className="script-viewport"><div className="script-page" style={{width: `${zoom * 100}%`}}><img src={source} alt={`${title}, page ${page}`} onError={() => setError('This image cannot be read. Download the original or request a clearer scan.')} />
      <svg viewBox="0 0 1 1" preserveAspectRatio="none" className="script-annotations" role="img" aria-label={`Review circles on page ${page}`}>
        {annotations.filter(a => a.page === page).map((a, index) => <g key={index}><title>{annotationLabels[a.kind] || a.kind}: {a.note}</title><ellipse cx={a.x + a.width / 2} cy={a.y + a.height / 2} rx={a.width / 2} ry={a.height / 2} className={`review-circle ${a.kind}`} vectorEffect="non-scaling-stroke"/></g>)}
      </svg>
    </div></div>}
    {!!annotations.length && <p className="muted">Circles identify regions for academic review. They do not by themselves establish a marking error.</p>}
  </section>;
}
