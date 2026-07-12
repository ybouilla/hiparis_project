import { test, expect } from '@playwright/test';

test('loads more items when scrolling', async ({ page }) => {
  await page.goto('/');

  const items = page.locator('[data-testid="feed-item"]');

  await expect(items).toHaveCount(20);

  await page.getByTestId('feed-loader').scrollIntoViewIfNeeded();

  await expect(items).toHaveCount(40, {
    timeout: 10000,
  });
});