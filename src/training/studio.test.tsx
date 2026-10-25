import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import TrainingStudio from './TrainingStudio';
import type { Dataset, Run, StudioState } from './studioApi';

const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock('./studioApi', async importOriginal => ({ ...await importOriginal<typeof import('./studioApi')>(), studioRequest: api }));
const dataset: Dataset = { id: 'dataset', name: 'Verified handwriting', kind: 'ocr', status: 'ready', examples: 20, groups: 12, reviewExamples: 0, synthetic: false, splits: { train: 14, validation: 3, test: 3 }, message: 'Ready' };
const run: Run = { id: 'run', name: 'Fictional walkthrough', kind: 'ocr', datasetId: 'dataset', status: 'completed', createdAt: '2026-10-25', epochs: 1, batchSize: 4, profile: 'small', device: 'cpu', seed: 42, synthetic: true, message: 'Completed fictional run', history: [{ epoch: 1, train_ctc_loss: 2, validation_cer: .7 }], completedEpochs: 1, totalEpochs: 1, progress: 100, canResume: false, trained: true, evaluation: { test: { character_error_rate: .7, examples: 3 } } };
let state: StudioState;
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); }; });
beforeEach(() => {
  state = { connected: true, trainingOnly: true, markingEnabled: false, device: 'CPU', torchVersion: 'test', datasets: [], runs: [], activeRunId: null };
  api.mockReset(); api.mockImplementation(async (path: string) => {
    if (path === '/status') return state;
    if (path.startsWith('/demo')) { state = { ...state, datasets: [dataset], runs: [run] }; return run; }
    if (path === '/datasets') { state = { ...state, datasets: [dataset] }; return dataset; }
    if (path === '/runs') { state = { ...state, runs: [{ ...run, synthetic: false, status: 'running' }], activeRunId: 'run' }; return state.runs[0]; }
    throw Error('Unexpected request');
  });
});

describe('Connected local training studio', () => {
  it('shows the actual model architecture without inventing a completed run', async () => {
    render(<TrainingStudio/>);
    expect(await screen.findByText('Local trainer connected')).toBeVisible();
    expect(screen.getByLabelText('Handwriting model architecture')).toBeVisible();
    expect(screen.getByText('Your learning curve starts with the first saved epoch.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start training' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /approve|mark scripts|deploy/i })).not.toBeInTheDocument();
  });
  it('starts a real demonstration request and renders returned epoch measurements', async () => {
    render(<TrainingStudio/>);
    await screen.findByText('Local trainer connected');
    await userEvent.click(screen.getByRole('button', { name: 'Run a tiny demonstration' }));
    expect(api).toHaveBeenCalledWith('/demo?kind=ocr', { method: 'POST' });
    expect(await screen.findByRole('img', { name: 'Validation character error rate' })).toBeVisible();
    expect(screen.getByText('Fictional demonstration · these metrics do not measure academic accuracy')).toBeVisible();
    expect(screen.getByText('70.0%')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Evaluation report' })).toBeEnabled();
  });
  it('imports reviewed files and starts training using the chosen dataset and epochs', async () => {
    render(<TrainingStudio/>);
    await screen.findByText('Local trainer connected');
    await userEvent.click(screen.getByRole('button', { name: 'Import dataset' }));
    const upload = new File(['{}\n'], 'labels.jsonl', { type: 'application/x-ndjson' });
    await userEvent.upload(screen.getByLabelText('Dataset source files'), upload);
    await userEvent.click(screen.getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: 'Import & prepare data' }));
    expect(await screen.findByText('Ready to train')).toBeVisible();
    const importCall = api.mock.calls.find(call => call[0] === '/datasets');
    expect((importCall?.[1].body as FormData).get('verified')).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: 'Model studio' }));
    fireEvent.change(screen.getByLabelText('Training epochs'), { target: { value: '3' } });
    await userEvent.click(screen.getByRole('button', { name: 'Start training' }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/runs', expect.objectContaining({ method: 'POST' })));
    const startCall = api.mock.calls.find(call => call[0] === '/runs');
    expect(JSON.parse(startCall?.[1].body)).toMatchObject({ datasetId: 'dataset', epochs: 3, profile: 'small', seed: 42 });
  });
  it('shows a usable offline state and a reconnect action', async () => {
    api.mockRejectedValue(Error('The local trainer is offline.'));
    render(<TrainingStudio/>);
    expect(await screen.findByText('The local trainer is offline.')).toBeVisible();
    expect(screen.getByText('./Start-TrainingStudio.ps1')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reconnect' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Run a tiny demonstration' })).toBeDisabled();
  });
});
