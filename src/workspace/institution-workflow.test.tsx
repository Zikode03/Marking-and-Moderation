import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import InstitutionWorkspace from './InstitutionWorkspace';
import { ReportsWorkspace, TasksWorkspace } from './OperationsWorkspace';
import { emptyAcademics } from './types';
const {
  api
} = vi.hoisted(() => ({
  api: vi.fn()
}));
vi.mock('../auth/session', () => ({
  request: api
}));
beforeEach(() => {
  api.mockReset();
  api.mockImplementation(async () => []);
});
describe('Institution management workflows', () => {
  it('saves a branch through the backend and refreshes the list', async () => {
    let saved = false;
    api.mockImplementation(async (path: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        saved = true;
        return {};
      }
      return path.endsWith('/branch') && saved ? [{
        id: 'b',
        kind: 'branch',
        code: 'NORTH',
        name: 'North campus',
        fields: {
          address: 'Main road'
        },
        active: true,
        revision: 1
      }] : [];
    });
    render(<InstitutionWorkspace academics={emptyAcademics} assessments={[]} manager />);
    await userEvent.click(screen.getByRole('button', {
      name: 'Branches'
    }));
    const add = await screen.findByRole('button', {
      name: 'Add record'
    });
    await waitFor(() => expect(add).toBeEnabled());
    await userEvent.click(add);
    await userEvent.type(screen.getByLabelText('Code'), 'NORTH');
    await userEvent.type(screen.getByLabelText('Name'), 'North campus');
    await userEvent.type(screen.getByLabelText('Address'), 'Main road');
    await userEvent.click(screen.getByRole('button', {
      name: 'Save'
    }));
    expect(await screen.findByText('North campus', {
      selector: 'td'
    })).toBeVisible();
    const call = api.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(call![1].body)).toMatchObject({
      code: 'NORTH',
      name: 'North campus',
      fields: {
        address: 'Main road'
      },
      revision: 0
    });
  });
  it('keeps administrative mutations unavailable in read-only learner views', async () => {
    api.mockResolvedValue([{
      id: 'l',
      kind: 'learner',
      code: 'C1',
      name: 'Learner One',
      fields: {},
      active: true,
      revision: 1
    }]);
    render(<InstitutionWorkspace academics={emptyAcademics} assessments={[]} manager={false} learnersOnly />);
    expect(await screen.findByText('Learner One')).toBeVisible();
    expect(screen.queryByRole('button', {
      name: 'Add record'
    })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', {
      name: /Edit Learner/
    })).not.toBeInTheDocument();
  });
  it('links an assigned task to its review queue', async () => {
    const open = vi.fn();
    api.mockResolvedValue([{
      scriptId: 's',
      candidate: 'C1',
      status: 'ReturnedToTeacher',
      stage: 'review',
      dueAt: null
    }]);
    render(<TasksWorkspace onQueue={open} />);
    await userEvent.click(await screen.findByRole('button', {
      name: 'Open review'
    }));
    expect(open).toHaveBeenCalledWith('review');
  });
  it('shows approved learner feedback in the individual report', async () => {
    api.mockResolvedValue([{
      id: 's',
      candidate: 'C1',
      assessment: 'Math exam',
      total: 7,
      maximum: 10,
      feedback: 'You earned credit for your method.',
      approvedAt: '2026-10-25T10:00:00Z',
      questions: [{
        number: '1',
        marks: 7,
        maxMarks: 10,
        feedback: 'Show each step.'
      }]
    }]);
    render(<ReportsWorkspace />);
    await userEvent.click(await screen.findByRole('button', {
      name: 'View report C1'
    }));
    expect(screen.getByText('You earned credit for your method.')).toBeVisible();
    expect(screen.getByText('Show each step.')).toBeVisible();
  });
});
