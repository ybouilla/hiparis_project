import { test, expect } from '@playwright/test';


//simply move around test
test('test', async ({ page }) => {
  await page.goto('http://127.0.0.1:5000/');
  await page.getByRole('link', { name: 'Movie', exact: true }).click();
  await page.getByRole('link', { name: 'Movie', exact: true }).click();
  await page.getByRole('link', { name: 'Movies Statistics' }).click();
  //await page.locator('g:nth-child(225) > .recharts-layer > .recharts-symbols').click();
  await page.getByRole('button', { name: '⭐ Display vote_average' }).click();


  // Left thumb (minimum year) : change year with the slider
const slider = page.getByTestId('release-year-slider');

const sliders = slider.getByRole('slider');

await expect(sliders).toHaveCount(2);

const maxSlider = sliders.nth(1);


await expect(maxSlider).toHaveAttribute('aria-valuenow', '2025');

await maxSlider.focus();
await maxSlider.press('ArrowLeft');
});