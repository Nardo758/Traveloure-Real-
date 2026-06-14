// e2e/fixtures/roles.ts
// Import { test, expect, authFile } from here in every spec.
//   test.use({ storageState: authFile('expert') })  ← run that describe block as the expert
// The extended `test` also collects console/page errors so any spec can assert on them.

import { test as base, expect } from '@playwright/test';
import path from 'node:path';
import { ROLES, type Role } from './accounts';

export const authFile = (role: Role) =>
  path.join(process.cwd(), 'e2e', 'auth', `${role}.json`);

type Fixtures = { consoleErrors: string[] };

export const test = base.extend<Fixtures>({
  consoleErrors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await use(errors);
  },
});

export { expect, ROLES };
export type { Role };
