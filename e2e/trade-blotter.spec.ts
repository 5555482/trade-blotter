import { test, expect } from '@playwright/test';

const VALID_TRADE = {
  symbol: 'AAPL',
  quantity: 500,
  price: 145.50,
  side: 'BUY',
  trader: 'ETEST',
  book: 'EQUITIES_UK',
  counterparty: 'Goldman Sachs',
};

/**
 * Edge case: form validation blocks submission when quantity is zero.
 *
 * The form's validate() function requires quantity > 0. A zero value must
 * show an inline error and keep the modal open — no trade should be created.
 */
test('form rejects zero quantity and keeps modal open', async ({ page }) => {
  await page.goto('/');

  // Open the new-trade modal
  await page.getByRole('button', { name: /new trade/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();

  // Fill all required fields — but enter 0 for quantity
  const dialog = page.getByRole('dialog');
  await dialog.locator('select').nth(0).selectOption('AAPL');        // Symbol
  await dialog.getByPlaceholder('e.g. 1000').fill('0');              // Quantity = 0 (invalid)
  await dialog.getByPlaceholder('e.g. 145.50').fill('150.00');       // Price
  await dialog.getByPlaceholder('e.g. JSMITH').fill('ETEST');        // Trader
  await dialog.locator('select').nth(2).selectOption('EQUITIES_UK'); // Book
  await dialog.locator('select').nth(3).selectOption('Goldman Sachs'); // Counterparty

  // Attempt to submit
  await dialog.getByRole('button', { name: 'Create Trade' }).click();

  // Validation error should appear next to the quantity field
  await expect(dialog.getByText('Must be positive')).toBeVisible();

  // Modal must still be open — the trade was NOT created
  await expect(dialog).toBeVisible();
});

/**
 * Edge case: Cancel button is disabled once a trade is already cancelled.
 *
 * The UI must not offer a second cancel for a terminal trade. This guards
 * against the user double-clicking or the optimistic update racing a stale
 * refetch.
 */
test('Cancel button is disabled for an already-cancelled trade', async ({ page, request }) => {
  // Create a trade directly via the API so the test is self-contained
  const createRes = await request.post('/api/trades', { data: VALID_TRADE });
  expect(createRes.ok()).toBeTruthy();
  const { id } = await createRes.json() as { id: string };

  // Cancel it immediately via the API — the trade is now in a terminal state
  const cancelRes = await request.post(`/api/trades/${id}/cancel`);
  expect(cancelRes.ok()).toBeTruthy();

  // Load the blotter — the row for this trade should exist on page 1
  // (newest trades come first; pagination is 50 rows)
  await page.goto('/');

  // The action buttons (Amend, Cancel) live in AG Grid's right-pinned column
  // container — a separate DOM layer from the main body rows.
  const actionRow = page
    .locator(`.ag-pinned-right-cols-container [row-id="${id}"]`)
    .first();
  await expect(actionRow).toBeVisible({ timeout: 10_000 });

  // The Cancel button in this row must be disabled
  const cancelBtn = actionRow.getByRole('button', { name: 'Cancel' });
  await expect(cancelBtn).toBeDisabled();

  // The Amend button should also be disabled for a cancelled trade
  const amendBtn = actionRow.getByRole('button', { name: 'Amend' });
  await expect(amendBtn).toBeDisabled();
});
