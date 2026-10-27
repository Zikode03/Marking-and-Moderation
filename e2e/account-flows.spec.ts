import { test, expect } from '@playwright/test';
test('landing remains one screen and pricing is absent', async ({ page }) => {
  for (const [width, height] of [
    [390, 844],
    [1366, 768],
  ]) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /Turn assessment/ })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pricing', exact: true })).toHaveCount(0);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight <= innerHeight + 1 &&
          document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
});
test('password recovery submits without revealing account existence', async ({ page }) => {
  await page.route('**/api/account/password/forgot', (route) =>
    route.fulfill({
      json: { message: 'If the account can receive recovery email, a reset link will be sent.' },
    }),
  );
  await page.goto('/forgot-password');
  await page.getByLabel('Staff email').fill('staff@example.org');
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If the account can receive');
});
test('reset deep link clears token from address and submits once', async ({ page }) => {
  let payload: unknown;
  await page.route('**/api/account/password/reset', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({ json: { message: 'Password updated. Sign in again.' } });
  });
  await page.goto('/reset-password#email=staff%40example.org&code=example-reset-token');
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel('New password', { exact: true }).fill('New!Password2026');
  await page.getByLabel('Confirm new password').fill('New!Password2026');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByRole('status')).toContainText('Password updated');
  expect(payload).toEqual({
    email: 'staff@example.org',
    code: 'example-reset-token',
    newPassword: 'New!Password2026',
  });
});
test('authenticator challenge is shown after correct password', async ({ page }) => {
  await page.route('**/login', (route) =>
    route.fulfill({
      status: 401,
      json: { error: 'Enter your authenticator or recovery code.', requiresTwoFactor: true },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: /School Grades/ }).click();
  await page.getByRole('button', { name: 'Public Public school', exact: true }).click();
  await page
    .getByRole('button', { name: 'CAPS / DBE DBE assessment pathway.', exact: true })
    .click();
  await page.getByLabel('Email address').fill('staff@example.org');
  await page.getByLabel('Password', { exact: true }).fill('Valid!Password2026');
  await page.getByRole('button', { name: 'Sign in to school' }).click();
  await expect(page.getByLabel('Authenticator code')).toBeVisible();
  await page.getByRole('button', { name: 'Use a recovery code' }).click();
  await expect(page.getByLabel('Recovery code', { exact: true })).toBeVisible();
});

test('staff can enroll an authenticator and keep recovery secrets out of browser storage', async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      'prospera.session.v3',
      JSON.stringify({
        version: 3,
        refreshToken: 'test-refresh',
        selection: { organisationType: 'school', sector: 'public', pathway: 'caps' },
      }),
    ),
  );
  let enabled = false;
  await page.route('**/*', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const tokens = {
      accessToken: 'test-access',
      refreshToken: enabled ? 'test-enabled-refresh' : 'test-setup-refresh',
    };
    let data: unknown;
    if (path === '/refresh') data = tokens;
    else if (path === '/api/me')
      data = { email: 'staff@example.org', schoolId: 'school', roles: ['Teacher'] };
    else if (path === '/api/account/security')
      data = {
        email: 'staff@example.org',
        mfaEnabled: enabled,
        mfaRequired: false,
        recoveryCodesRemaining: enabled ? 2 : 0,
        enrollmentRequired: false,
      };
    else if (path === '/api/account/mfa/setup')
      data = {
        sharedKey: 'TESTSETUPKEYONLY',
        authenticatorUri: 'otpauth://totp/Prospera?secret=TESTSETUPKEYONLY',
        session: tokens,
      };
    else if (path === '/api/account/mfa/enable') {
      enabled = true;
      data = {
        session: { accessToken: 'test-access', refreshToken: 'test-enabled-refresh' },
        recoveryCodes: ['TEST-CODE-ONE', 'TEST-CODE-TWO'],
      };
    } else if (path === '/api/academics')
      data = { grades: [8, 9, 10, 11, 12], faculties: [], modules: [], allocations: [], staff: [] };
    else if (path === '/api/ai/status')
      data = { ready: false, status: 'Awaiting training', model: null };
    else if (path.startsWith('/api/')) data = [];
    else {
      await route.continue();
      return;
    }
    await route.fulfill({ json: data });
  });
  await page.goto('/');
  await page
    .getByRole('navigation', { name: 'Workspace' })
    .getByRole('button', { name: 'Account security', exact: true })
    .click();
  await page.getByLabel('Current password for MFA').fill('Password!Only2026');
  await page.getByRole('button', { name: 'Set up authenticator' }).click();
  await expect(page.getByText('TESTSETUPKEYONLY', { exact: true })).toBeVisible();
  await page.getByLabel('Authenticator code', { exact: true }).fill('123456');
  await page.getByRole('button', { name: 'Verify and enable MFA' }).click();
  await expect(page.getByText('TEST-CODE-ONE', { exact: true })).toBeVisible();
  await expect(page.getByText('2 recovery codes remaining.')).toBeVisible();
  const saved = await page.evaluate(() => sessionStorage.getItem('prospera.session.v3')!);
  expect(saved).toContain('test-enabled-refresh');
  expect(saved).not.toContain('TESTSETUPKEYONLY');
  expect(saved).not.toContain('TEST-CODE-ONE');
});
