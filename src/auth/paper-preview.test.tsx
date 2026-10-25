import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MarkedPaperPreview from './MarkedPaperPreview';

afterEach(() => vi.unstubAllGlobals());

describe('Illustrative marking preview', () => {
  it('shows fictional marked work and clearly discloses that AI marking is not live', () => {
    render(<MarkedPaperPreview />);
    const paper = screen.getByRole('tabpanel', { name: 'Marked paper' });
    expect(paper).toHaveTextContent('DEMO-001');
    expect(paper).toHaveTextContent(/8\s*\/\s*10/);
    expect(paper).toHaveTextContent('Fictional work · Demonstration only');
    expect(screen.getByText('Illustrative preview. AI marking is not yet available.')).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Marked paper' })).toHaveAttribute('aria-selected', 'true');
  });

  it('supports keyboard navigation between paper and the rubric behind its suggested mark', async () => {
    render(<MarkedPaperPreview />);
    const paperTab = screen.getByRole('tab', { name: 'Marked paper' });
    paperTab.focus();
    await userEvent.keyboard('{ArrowRight}');
    const rubricTab = screen.getByRole('tab', { name: 'Rubric' });
    expect(rubricTab).toHaveFocus();
    expect(rubricTab).toHaveAttribute('aria-selected', 'true');
    const rubric = screen.getByRole('tabpanel', { name: 'Rubric' });
    expect(within(rubric).getByText('Verification')).toBeVisible();
    expect(rubric).toHaveTextContent('Substitution checks are missing.');
    expect(rubric).toHaveTextContent(/8\s*\/\s*10/);
    expect(screen.queryByRole('tabpanel', { name: 'Marked paper' })).not.toBeInTheDocument();
    await userEvent.keyboard('{Home}');
    expect(paperTab).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Marked paper' })).toBeVisible();
  });

  it('fits the paper to its available height and never enlarges it beyond its natural size', () => {
    let resized: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resized = callback; }
      observe() { /* dimensions are supplied below, as in a browser layout pass */ }
      disconnect = disconnect;
    });
    const view = render(<MarkedPaperPreview />);
    const area = view.container.querySelector('.paper-fit-area')!;
    const stage = view.container.querySelector('.paper-preview-stage')!;
    Object.defineProperty(area, 'clientHeight', { configurable: true, value: 216 });
    Object.defineProperty(stage, 'offsetHeight', { configurable: true, value: 500 });
    act(() => resized?.());
    expect(stage).toHaveStyle({ transform: 'scale(0.4)' });
    Object.defineProperty(area, 'clientHeight', { configurable: true, value: 800 });
    act(() => resized?.());
    expect(stage).toHaveStyle({ transform: 'scale(1)' });
    view.unmount();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
