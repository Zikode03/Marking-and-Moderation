import { test, expect } from '@playwright/test';

test('administrator protects appeals and must confirm an eligible retention deletion', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('prospera.session.v3', JSON.stringify({ version: 3, refreshToken: 'test-refresh', selection: { organisationType: 'school', sector: 'public', pathway: 'caps' } })));
  let held = false;
  let deleted = false;
  const id = '00000000-0000-4000-8000-000000000001';
  await page.route('**/*', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown;
    if (path === '/refresh') data = { accessToken: 'test-access', refreshToken: 'test-refresh' };
    else if (path === '/api/me') data = { email: 'admin@example.org', schoolId: 'school', roles: ['SchoolAdmin'] };
    else if (path === '/api/account/security') data = { enrollmentRequired: false };
    else if (path === '/api/academics') data = { grades: [8, 9, 10, 11, 12], faculties: [], modules: [], allocations: [], staff: [] };
    else if (path === '/api/ai/status') data = { ready: false, status: 'Awaiting training', model: null };
    else if (path === '/api/data-protection') data = { retentionDays: 365, usedBytes: 1024, quotaBytes: 10737418240, limit: 200, batches: deleted ? [] : [{ id, createdAt: '2024-01-01', lastActivity: '2024-01-02', eligible: !held, held, trainingAuthorised: false, token: held ? 'held-preview' : 'fresh-preview', reason: held ? 'Protected by a retention hold.' : 'Retention period elapsed.' }] };
    else if (path.endsWith('/hold')) { const body = route.request().postDataJSON(); expect(body.reason).toBe('APPEAL-001'); held = body.enabled; data = { message: 'Decision recorded.' }; }
    else if (path.endsWith('/purge')) { expect(route.request().postDataJSON()).toEqual({ previewToken: 'fresh-preview', confirmation: 'DELETE EXPIRED BATCH' }); deleted = true; data = { message: 'Expired batch deleted.' }; }
    else if (path.startsWith('/api/')) data = [];
    else { await route.continue(); return; }
    await route.fulfill({ json: data });
  });
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Workspace' }).getByRole('button', { name: 'Learner data protection', exact: true }).click();
  await page.getByLabel('Batch reference').selectOption(id);
  const purge = page.getByRole('button', { name: 'Permanently delete expired batch' });
  await expect(purge).toBeDisabled();
  await page.getByLabel('Decision reference or reason').fill('APPEAL-001');
  await page.getByRole('button', { name: 'Protect with appeal hold' }).click();
  await expect(page.getByText('Protected by a retention hold.', { exact: true })).toBeVisible();
  await expect(purge).toHaveCount(0);
  await page.getByRole('button', { name: 'Release appeal hold' }).click();
  await expect(purge).toBeDisabled();
  await page.getByLabel('Type DELETE EXPIRED BATCH').fill('DELETE EXPIRED BATCH');
  await expect(purge).toBeEnabled();
  await page.screenshot({ path: '.local/data-protection-workspace.png', fullPage: true });
  await purge.click();
  await expect(page.getByText('Expired batch deleted.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Batch reference').getByRole('option')).toHaveCount(1);
});
