# Browser E2E Tests (Playwright)

This folder contains browser-level regression coverage for shell and route behavior.

## Run locally

From `saas-ui/`:

1. Install dependencies:
   - `npm install`
2. Install Playwright browsers (first run only):
   - `npx playwright install`
3. List discovered tests:
   - `npx playwright test --list`
4. Run all E2E tests:
   - `npm run e2e`
5. Run in headed mode:
   - `npm run e2e:headed`
6. Open the HTML report (after a run):
   - `npm run e2e:report`

## CI expectation

- `npm run e2e` should execute as a protected-branch quality gate once browser route regression coverage is fully wired.
