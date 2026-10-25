import { StrictMode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from './AuthProvider';
import { clearSession, request } from './session';

const fetchMock = vi.fn<typeof fetch>();
const teacher = { email: 'teacher@example.test', roles: ['Teacher'], schoolId: 'school-a' };
const lecturer = { email: 'lecturer@example.test', roles: ['Lecturer'], schoolId: 'school-a' };
const admin = { email: 'admin@example.test', roles: ['SchoolAdmin'], schoolId: 'school-a' };
const tokens = { accessToken: 'test-access', refreshToken: 'test-refresh' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function backend(profile = teacher) {
  fetchMock.mockImplementation(async input => {
    const path = String(input);
    if (path.endsWith('/login') || path.endsWith('/refresh')) return json(tokens);
    if (path.endsWith('/api/me')) return json(profile);
    if (path.includes('/api/academics?')) return json(path.includes('organisationType=school') ? {
      grades: [8, 9, 10, 11, 12], faculties: [], modules: [],
      allocations: [{ id: 'allocation-1', userId: 'teacher-1', grade: 10, subject: 'Mathematics', moduleId: null }],
      staff: profile.roles.includes('SchoolAdmin') ? [{ id: 'teacher-1', email: teacher.email, roles: ['Teacher'] }] : [],
    } : {
      grades: [8, 9, 10, 11, 12], faculties: [{ id: 'faculty-1', name: 'Business & Management', code: 'BUS' }],
      modules: [{ id: 'module-1', facultyId: 'faculty-1', code: 'BMAN101', name: 'Business Management' }],
      allocations: [{ id: 'module-allocation', userId: 'lecturer-1', grade: null, subject: null, moduleId: 'module-1' }],
      staff: profile.roles.includes('SchoolAdmin') ? [{ id: 'lecturer-1', email: lecturer.email, roles: ['Lecturer'] }] : [],
    });
    if (path.endsWith('/api/ai/batches')) return json([]);
    if (path.endsWith('/api/ai/status')) return json({ready:false,status:'Awaiting training',model:null});
    if (path.endsWith('/api/assessments') || path.endsWith('/api/submissions')) return json([]);
    return json({ error: 'Missing endpoint' }, 404);
  });
}
function show() {
  return render(<StrictMode><AuthProvider><App /></AuthProvider></StrictMode>);
}
async function chooseSchool() {
  await userEvent.click(await screen.findByRole('button', { name: /School Grades 8–12/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Public Public school' }));
  await userEvent.click(screen.getByRole('button', { name: 'CAPS / DBE DBE assessment pathway.' }));
}
async function enterCredentials(email = teacher.email) {
  await userEvent.type(screen.getByLabelText('Email address'), email);
  await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'Example!Password9');
  await userEvent.click(screen.getByRole('button', { name: 'Sign in to school' }));
}

beforeEach(() => {
  clearSession();
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  backend();
});
afterEach(() => { clearSession(); vi.unstubAllGlobals(); });

describe('Organisation sign-in and account roles', () => {
  it('starts with two clear workspace choices and no credential fields', async () => {
    show();
    expect(await screen.findByRole('heading', { name: 'Welcome to Prospera.' })).toBeVisible();
    expect(screen.getByRole('button', { name: /Institution Universities, colleges/ })).toBeVisible();
    expect(screen.getAllByRole('button', { name: /^(Institution Universities|School Grades)/ })).toHaveLength(2);
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows going back through the choices and clears the password', async () => {
    show();
    await chooseSchool();
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'Secret');
    await userEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await userEvent.click(screen.getByRole('button', { name: /Institution Universities, colleges/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Private Private / independent institution' }));
    expect(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
    expect(screen.getByLabelText('Password', { exact: true })).toHaveAttribute('type', 'password');
    expect(screen.getByRole('button', { name: 'Sign in to institution' })).toBeDisabled();
  });

  it('signs in a teacher and only exposes permitted navigation', async () => {
    show();
    await chooseSchool();
    await enterCredentials();
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'AI marking' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Moderation' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approvals' })).not.toBeInTheDocument();
    expect(screen.getByText('teacher@example.test')).toBeVisible();
    const stored = JSON.parse(sessionStorage.getItem('prospera.session.v3')!);
    expect(stored.refreshToken).toBe(tokens.refreshToken);
    expect(stored.password).toBeUndefined();
    expect(stored.accessToken).toBeUndefined();
    await userEvent.click(screen.getByRole('button', { name: 'Grades & subjects' }));
    expect(screen.getByRole('heading', { name: 'Grade 10' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Grade 8' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Faculties & modules' })).not.toBeInTheDocument();
  });

  it('routes school administrators to management with approvals instead of marking', async () => {
    backend(admin);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Institution Universities, colleges/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Private Private / independent institution' }));
    await userEvent.type(screen.getByLabelText('Email address'), admin.email);
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'Example!Password9');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in to institution' }));
    expect(await screen.findByRole('button', { name: 'Approvals' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'AI marking' })).toBeVisible();
    expect(screen.getByText('School administrator', { selector: '.workspace-role' })).toBeVisible();
  });

  it('routes lecturers to allocated modules without management access', async () => {
    backend(lecturer);
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Institution Universities, colleges/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Private Private / independent institution' }));
    await userEvent.type(screen.getByLabelText('Email address'), lecturer.email);
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'Example!Password9');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in to institution' }));
    expect(await screen.findByRole('button', { name: 'AI marking' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Approvals' })).not.toBeInTheDocument();
    const stored = JSON.parse(sessionStorage.getItem('prospera.session.v3')!);
    expect(stored.selection.organisationType).toBe('institution');
    expect(screen.getByText('INSTITUTION WORKSPACE')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Faculties & modules' }));
    expect(screen.getByRole('heading', { name: 'Business & Management' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'AI marking' }));
    await userEvent.click(screen.getByRole('button', { name: 'Upload scripts' }));
    expect(screen.getByLabelText('Faculty')).toHaveValue('faculty-1');
    expect(screen.getByLabelText('Module')).toHaveValue('module-1');
    expect(screen.getByLabelText('Academic year')).toBeVisible();
    expect(screen.queryByLabelText('Grade')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('School type')).not.toBeInTheDocument();
  });

  it('does not let a teacher enter the institution workspace', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Institution Universities, colleges/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Public Public institution' }));
    await userEvent.type(screen.getByLabelText('Email address'), teacher.email);
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'Example!Password9');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in to institution' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Use a lecturer or professor account');
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(sessionStorage.getItem('prospera.session.v3')).toBeNull();
  });

  it('gives school administrators all five grades and an initial teacher-allocation form', async () => {
    backend(admin); show(); await chooseSchool(); await enterCredentials(admin.email);
    await userEvent.click(await screen.findByRole('button', { name: 'Grades & subjects' }));
    for (const grade of [8, 9, 10, 11, 12]) expect(screen.getByRole('heading', { name: `Grade ${grade}` })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Teaching staff' }));
    expect(screen.getByLabelText('Initial grade')).toBeVisible();
    expect(screen.getByLabelText('Initial subject')).toBeVisible();
    expect(screen.queryByLabelText('Initial faculty module')).not.toBeInTheDocument();
  });

  it('gives institutional administrators faculty/module setup and lecturer/professor roles', async () => {
    backend(admin); show();
    await userEvent.click(await screen.findByRole('button', { name: /Institution Universities, colleges/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Private Private / independent institution' }));
    await userEvent.type(screen.getByLabelText('Email address'), admin.email);
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'Example!Password9');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in to institution' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Faculties & modules' }));
    expect(screen.getByLabelText('Faculty name')).toBeVisible();
    expect(screen.getByLabelText('Module code')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Academic staff' }));
    expect(screen.getByLabelText('Initial faculty module')).toBeVisible();
    expect(screen.getByRole('option', { name: 'Professor' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Initial grade')).not.toBeInTheDocument();
  });

  it.each(['public', 'private'] as const)('requires a %s institution choice before showing sign-in', async sector => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: /Institution Universities, colleges/ }));
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: sector === 'public' ? 'Public Public institution' : 'Private Private / independent institution' }));
    expect(screen.getByLabelText('Email address')).toBeVisible();
    expect(screen.queryByRole('button', { name: /CAPS/ })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['public', 'caps'], ['private', 'caps'], ['private', 'ieb'], ['public', 'ieb'],
  ] as const)('requires school type %s and pathway %s, and preserves them after sign-in', async (sector, pathway) => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: /School Grades 8–12/ }));
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: sector === 'public' ? 'Public Public school' : 'Private Private / independent school' }));
    expect(screen.queryByLabelText('Email address')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: pathway === 'caps' ? 'CAPS / DBE DBE assessment pathway.' : 'IEB Independent Examinations Board.' }));
    await enterCredentials();
    await screen.findByRole('button', { name: 'Sign out' });
    const stored = JSON.parse(sessionStorage.getItem('prospera.session.v3')!);
    expect(stored.selection).toEqual({ organisationType: 'school', sector, pathway });
    await userEvent.click(screen.getByRole('button', { name: 'AI marking' }));
    await userEvent.click(screen.getByRole('button', { name: 'Upload scripts' }));
    expect(screen.getByLabelText('School type')).toHaveValue(sector === 'private' ? 'Independent' : 'Public');
    expect(screen.getByLabelText('Assessment pathway')).toHaveValue(pathway === 'ieb' ? 'IEB' : 'DBE-NSC');
  });

  it.each([
    [401, 'The email or password is incorrect'],
    [429, 'Too many attempts'],
    [503, 'Sign-in is temporarily unavailable'],
  ])('explains a %s response and re-enables sign-in', async (status, message) => {
    fetchMock.mockResolvedValue(json({}, status));
    show();
    await chooseSchool();
    await enterCredentials();
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getByRole('button', { name: 'Sign in to school' })).toBeEnabled();
  });

  it('handles an unavailable backend without showing technical errors', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    show();
    await chooseSchool();
    await enterCredentials();
    expect(await screen.findByRole('alert')).toHaveTextContent('We couldn’t connect');
  });

  it('restores the saved tab session only once under React StrictMode', async () => {
    sessionStorage.setItem('prospera.session.v3', JSON.stringify({ version: 3, refreshToken: 'previous', selection: { organisationType: 'school', sector: 'public', pathway: 'caps' } }));
    show();
    expect(await screen.findByRole('button', { name: 'Sign out' })).toBeVisible();
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/refresh'))).toHaveLength(1);
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/login'))).toBe(false);
    expect(screen.getByText('SCHOOL WORKSPACE')).toBeVisible();
  });

  it('clears a rejected saved session and offers sign-in', async () => {
    sessionStorage.setItem('prospera.session.v3', JSON.stringify({ version: 3, refreshToken: 'expired', selection: { organisationType: 'school', sector: 'public', pathway: 'caps' } }));
    fetchMock.mockResolvedValue(json({}, 401));
    show();
    expect(await screen.findByRole('heading', { name: 'Welcome to Prospera.' })).toBeVisible();
    expect(sessionStorage.getItem('prospera.session.v3')).toBeNull();
  });

  it('signs out completely without restoring the prior account', async () => {
    show();
    await chooseSchool();
    await enterCredentials();
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('heading', { name: 'Welcome to Prospera.' })).toBeVisible();
    expect(sessionStorage.getItem('prospera.session.v3')).toBeNull();
    expect(screen.queryByText(teacher.email)).not.toBeInTheDocument();
  });

  it('deduplicates token renewal when multiple protected requests expire together', async () => {
    show();
    await chooseSchool();
    await enterCredentials();
    await screen.findByRole('button', { name: 'Sign out' });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/assessments')).length).toBeGreaterThan(0));
    fetchMock.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/refresh')) return json({ ...tokens, accessToken: 'renewed' });
      return (init?.headers as Record<string, string>)?.Authorization === 'Bearer renewed' ? json([]) : json({}, 401);
    });
    await Promise.all([request('/api/assessments'), request('/api/submissions')]);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/refresh'))).toHaveLength(1);
  });

  it('lets the browser set multipart boundaries while keeping upload authentication', async () => {
    show(); await chooseSchool(); await enterCredentials();
    await screen.findByRole('button', {name:'Sign out'});
    const body = new FormData(); body.append('paper', new File(['%PDF-1.4'], 'paper.pdf'));
    fetchMock.mockImplementation(async () => json({id:'uploaded'}));
    await request('/api/ai/batches', {method:'POST', body});
    const call = [...fetchMock.mock.calls].reverse().find(([url, init]) => String(url).endsWith('/api/ai/batches') && init?.method === 'POST')!;
    const headers = new Headers(call[1]?.headers);
    expect(headers.has('Content-Type')).toBe(false);
    expect(headers.get('Authorization')).toBe('Bearer test-access');
    expect(call[1]?.body).toBe(body);
  });

  it('provides real account-help guidance without a fake password-reset link', async () => {
    show();
    await userEvent.click(await screen.findByRole('button', { name: 'Need help signing in?' }));
    expect(screen.getByText('Your organisation sets up your account.')).toBeVisible();
  });
});
