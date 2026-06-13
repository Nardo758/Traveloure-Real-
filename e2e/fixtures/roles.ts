import path from 'node:path';
import { test as base, expect, type ConsoleMessage } from '@playwright/test';
import type { Role } from './accounts';

/**
 * Resolves the cached storageState file for a role, written by global-setup.
 * Use in a spec via:  test.use({ storageState: authFile('expert') })
 */
export function authFile(role: Role): string {
  return path.join(process.cwd(), 'e2e', 'auth', `${role}.json`);
}

/**
 * Extended `test` that captures browser console errors + page errors for the
 * duration of each test. For the smoke layer these are surfaced as attachments
 * (non-fatal); a later layer can promote them to hard assertions per the
 * README's "Gates" section.
 */
export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: async ({ page }, use, testInfo) => {
    const errors: string[] = [];

    const onConsole = (msg: ConsoleMessage) => {
      if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
    };
    const onPageError = (err: Error) => {
      errors.push(`pageerror: ${err.message}`);
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    await use(errors);

    page.off('console', onConsole);
    page.off('pageerror', onPageError);

    if (errors.length) {
      await testInfo.attach('console-errors', {
        body: errors.join('\n'),
        contentType: 'text/plain',
      });
    }
  },
});

export { expect };
