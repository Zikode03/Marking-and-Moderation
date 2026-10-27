export type Portal = 'teacher' | 'school';
export type OrganisationType = 'institution' | 'school';
export type Sector = 'public' | 'private';
export type OrganisationSelection =
  | { organisationType: 'institution'; sector: Sector }
  | { organisationType: 'school'; sector: Sector; pathway: 'caps' | 'ieb' };
export type Profile = { email: string; schoolId: string; roles: string[]; organisationType?: OrganisationType | null; sector?: Sector | null };
export type Session = { profile: Profile; portal: Portal; selection: OrganisationSelection };
type Tokens = { accessToken: string; refreshToken: string };
type SavedSession = { version: 3; refreshToken: string; selection: OrganisationSelection };

const API = (import.meta.env.VITE_API_URL || 'http://localhost:5080').replace(/\/$/, '');
const STORAGE_KEY = 'prospera.session.v3';
export const SESSION_ENDED = 'prospera:session-ended';
let accessToken = '';
let saved: SavedSession | null = null;
let generation = 0;
let renewal: Promise<void> | null = null;
let restoration: Promise<Session | null> | null = null;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function send<T>(path: string, init: RequestInit = {}, token = ''): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API + path, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15000),
      headers: {
        ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError(0, 'We couldn’t connect. Please try again in a moment.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(response.status, data.error || data.detail || data.title || 'Something went wrong. Please try again.');
  }
  if (response.status === 204) return undefined as T;
  if (new Headers(init.headers).get('Accept') === 'application/octet-stream') return await response.blob() as T;
  return response.json();
}

function persist(value: SavedSession) {
  saved = value;
  // Sign-in still works when browser storage is unavailable.
  try {
    sessionStorage.removeItem('prospera.session.v1');
    sessionStorage.removeItem('prospera.session.v2');
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch { /* memory-only session */ }
}

export function validSelection(value: unknown): value is OrganisationSelection {
  if (!value || typeof value !== 'object' || !('sector' in value) ||
    (value.sector !== 'public' && value.sector !== 'private') || !('organisationType' in value)) return false;
  if (value.organisationType === 'institution') return true;
  return value.organisationType === 'school' && 'pathway' in value && (value.pathway === 'caps' || value.pathway === 'ieb');
}

function readSaved(): SavedSession | null {
  if (saved) return saved;
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null');
    if (value && typeof value === 'object' && 'version' in value && value.version === 3 &&
      'selection' in value && validSelection(value.selection) &&
      'refreshToken' in value && typeof value.refreshToken === 'string' && value.refreshToken) {
      saved = value as SavedSession;
    }
  } catch { /* missing, blocked, or invalid storage */ }
  return saved;
}

export function clearSession() {
  generation++;
  accessToken = '';
  saved = null;
  try { sessionStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem('prospera.session.v1'); sessionStorage.removeItem('prospera.session.v2'); } catch { /* storage unavailable */ }
}

function accountPortal(profile: Profile): Portal {
  if (profile.roles.some(role => ['SchoolAdmin', 'HOD', 'Moderator', 'Principal', 'AcademicAdmin'].includes(role))) return 'school';
  if (profile.roles.some(role => ['Teacher', 'Lecturer', 'Professor'].includes(role))) return 'teacher';
  throw new ApiError(403, 'Your account has no assigned staff role. Please contact your administrator.');
}

function validateAcademicRole(profile: Profile, selection: OrganisationSelection) {
  if (profile.organisationType && profile.organisationType !== selection.organisationType) throw new ApiError(403, 'Choose the organisation type registered for your account.');
  if (profile.sector && profile.sector !== selection.sector) throw new ApiError(403, 'Choose the public or private sector registered for your account.');
  const leadership = profile.roles.some(role => ['SchoolAdmin', 'AcademicAdmin', 'HOD', 'Moderator', 'Principal'].includes(role));
  if (leadership) return;
  if (selection.organisationType === 'school' && !profile.roles.includes('Teacher'))
    throw new ApiError(403, 'Use a teacher account for the school workspace. Lecturer and professor accounts use Institution.');
  if (selection.organisationType === 'institution' && !profile.roles.some(role => ['Lecturer', 'Professor'].includes(role)))
    throw new ApiError(403, 'Use a lecturer or professor account for the institution workspace. Teacher accounts use School.');
}

function checkTokens(tokens: Tokens) {
  if (!tokens.accessToken || !tokens.refreshToken) throw new ApiError(500, 'Sign-in could not be completed. Please try again.');
}

export async function signIn(email: string, password: string, selection: OrganisationSelection): Promise<Session> {
  if (!validSelection(selection)) throw new ApiError(400, 'Choose your organisation type, public or private, and school assessment pathway before signing in.');
  const attempt = generation;
  const tokens = await send<Tokens>('/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
  checkTokens(tokens);
  const profile = await send<Profile>('/api/me', {}, tokens.accessToken);
  const portal = accountPortal(profile);
  validateAcademicRole(profile, selection);
  if (attempt !== generation) throw new ApiError(401, 'Sign-in was cancelled. Please try again.');
  accessToken = tokens.accessToken;
  persist({ version: 3, refreshToken: tokens.refreshToken, selection });
  return { profile, portal, selection };
}

async function renewAccess() {
  if (renewal) return renewal;
  const current = readSaved();
  if (!current) throw new ApiError(401, 'Your session has ended. Please sign in again.');
  const attempt = generation;
  renewal = (async () => {
    const tokens = await send<Tokens>('/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: current.refreshToken }) });
    checkTokens(tokens);
    if (attempt !== generation) throw new ApiError(401, 'Your session has ended. Please sign in again.');
    accessToken = tokens.accessToken;
    persist({ ...current, refreshToken: tokens.refreshToken });
  })().finally(() => { renewal = null; });
  return renewal;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  try {
    return await send<T>(path, init, accessToken);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !accessToken) throw error;
    try {
      await renewAccess();
      return await send<T>(path, init, accessToken);
    } catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.status === 401) {
        clearSession();
        window.dispatchEvent(new Event(SESSION_ENDED));
      }
      throw refreshError;
    }
  }
}

// XMLHttpRequest exposes real upload-byte progress; fetch does not expose it here.
export async function uploadWithProgress<T>(path: string, body: FormData, onProgress: (percent: number) => void, signal: AbortSignal): Promise<T> {
  const attempt = () => new Promise<T>((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Upload cancelled', 'AbortError')); return; }
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    const cleanup = () => signal.removeEventListener('abort', abort);
    xhr.open('POST', API + path); xhr.timeout = 120000;
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100)); };
    xhr.onload = () => {
      cleanup(); let value: Record<string, string>;
      try { value = JSON.parse(xhr.responseText); } catch { reject(new ApiError(xhr.status, 'The server returned an unreadable upload response. Refresh the queue before retrying.')); return; }
      if (xhr.status >= 200 && xhr.status < 300) resolve(value as T);
      else reject(new ApiError(xhr.status, value.error || value.detail || value.title || 'The upload could not be saved.'));
    };
    xhr.onerror = () => { cleanup(); reject(new ApiError(0, 'Connection lost. Check the queue before retrying to avoid uploading the same batch twice.')); };
    xhr.ontimeout = () => { cleanup(); reject(new ApiError(0, 'Upload timed out. Check the queue before retrying.')); };
    xhr.onabort = () => { cleanup(); reject(new DOMException('Upload cancelled', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true }); xhr.send(body);
  });
  try { return await attempt(); }
  catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401 || !accessToken || signal.aborted) throw error;
    try { await renewAccess(); onProgress(0); return await attempt(); }
    catch (refreshError) {
      if (refreshError instanceof ApiError && refreshError.status === 401) { clearSession(); window.dispatchEvent(new Event(SESSION_ENDED)); }
      throw refreshError;
    }
  }
}

export function restoreSession(): Promise<Session | null> {
  if (restoration) return restoration;
  const current = readSaved();
  if (!current) return Promise.resolve(null);
  restoration = (async () => {
    try {
      await renewAccess();
      const profile = await send<Profile>('/api/me', {}, accessToken);
      validateAcademicRole(profile, current.selection);
      return { profile, portal: accountPortal(profile), selection: current.selection };
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) clearSession();
      throw error;
    }
  })().finally(() => { restoration = null; });
  return restoration;
}

export function loginError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return 'The email or password is incorrect, or your account needs attention. Check your details or contact your school administrator.';
    if (error.status === 429) return 'Too many attempts. Please wait a minute before trying again.';
    if (error.status >= 500) return 'Sign-in is temporarily unavailable. Please try again shortly.';
    return error.message;
  }
  return 'We couldn’t sign you in. Please try again.';
}

export function roleLabel(roles: string[]): string {
  return roles.map(role => ({ SchoolAdmin: 'School administrator', Teacher: 'Teacher', Lecturer: 'Lecturer', Professor: 'Professor', HOD: 'Head of department',
    Principal: 'Principal', AcademicAdmin: 'Academic administrator' }[role] || role)).join(' · ');
}
