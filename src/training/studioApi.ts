export type ModelKind = 'ocr' | 'scorer';
export type Dataset = { id: string; name: string; kind: ModelKind; status: 'preparing' | 'ready' | 'needs_data' | 'failed'; examples: number; groups: number; reviewExamples: number; synthetic: boolean; message: string; splits: Record<string, number> | null };
export type Epoch = { epoch: number; member?: number; train_loss?: number; train_ctc_loss?: number; validation_cer?: number; validation_mae_fraction?: number };
export type Run = { id: string; name: string; datasetId: string; kind: ModelKind; status: string; createdAt: string; epochs: number; batchSize: number; profile: string; device: string; seed: number; synthetic: boolean; message: string; history: Epoch[]; completedEpochs: number; totalEpochs: number; progress: number; canResume: boolean; trained: boolean; evaluation: Record<string, unknown> | null };
export type StudioState = { connected: boolean; trainingOnly: boolean; markingEnabled: false; device: string; torchVersion: string; datasets: Dataset[]; runs: Run[]; activeRunId: string | null };
export type Trial = { researchOnly: boolean; synthetic: boolean; suggestedMarks?: number; maxMarks?: number; reviewSignal?: number; ensembleSpread?: number; text?: string; confidence?: number; message: string };

const SERVICE = 'http://127.0.0.1:8001';
let sessionKey = '';
let connecting: Promise<string> | null = null;

async function connect(signal?: AbortSignal) {
  if (!connecting) {
    connecting = fetch(`${SERVICE}/studio/session`, { cache: 'no-store', signal }).then(async response => {
      if (!response.ok) throw new Error('Open the studio at localhost:5173 or 127.0.0.1:5173.');
      const value = await response.json() as { key: string };
      sessionKey = value.key;
      return sessionKey;
    }).finally(() => { connecting = null; });
  }
  return connecting;
}

export async function studioRequest<T>(path: string, options: RequestInit = {}, blob = false): Promise<T> {
  let response: Response;
  const signal = options.signal ?? AbortSignal.timeout(120000);
  try {
    if (!sessionKey) await connect(signal);
    const headers = () => ({ ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), 'X-Prospera-Studio-Key': sessionKey, ...options.headers });
    response = await fetch(`${SERVICE}/studio${path}`, { ...options, signal, cache: 'no-store', headers: headers() });
    if (response.status === 401) {
      await connect(signal);
      response = await fetch(`${SERVICE}/studio${path}`, { ...options, signal, cache: 'no-store', headers: headers() });
    }
  } catch (error) {
    if (signal.aborted) throw error;
    throw new Error('The local trainer is offline. Start it with Start-TrainingStudio.ps1, then reconnect.');
  }
  if (!response.ok) {
    const value = await response.json().catch(() => ({})) as { detail?: unknown };
    throw new Error(typeof value.detail === 'string' ? value.detail : 'The trainer could not complete this request. Check the selected files and settings.');
  }
  return (blob ? await response.blob() : await response.json()) as T;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const modelNames: Record<ModelKind, string> = { ocr: 'Handwriting reader', scorer: 'Rubric scorer' };
