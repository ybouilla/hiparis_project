import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Size budget: what the pages download must stay within the limits of performance-budget.json.
 *
 * Sizes are GZIPPED, as nginx sends them (the test server itself does not compress): the page's
 * JavaScript and CSS files are read from the build folder, which is what the server serves, and
 * compressed here with nginx's default gzip level. Only the site's own files count: the posters
 * come from another server (TMDB). A failing run prints the table below, so the PR shows which
 * number crossed which limit.
 */
const budget = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'performance-budget.json'), 'utf8'));
const BUILD_DIR = path.join(__dirname, '..', 'build');

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;
const NGINX_GZIP_LEVEL = 1; // nginx's default `gzip_comp_level`

/** Gzipped size of a file of the build folder, from its URL path. Fails loudly if it is not there. */
function gzipSizeOfBuildFile(urlPath) {
  const file = path.join(BUILD_DIR, urlPath);
  if (!file.startsWith(BUILD_DIR) || !fs.existsSync(file)) {
    throw new Error(`${urlPath} was requested by the page but is not in ${BUILD_DIR}: run "npm run build" in frontend/`);
  }
  return zlib.gzipSync(fs.readFileSync(file), { level: NGINX_GZIP_LEVEL }).length;
}

/** Records every response of the site (same origin): its path, type and status. */
function recordSiteResponses(page, origin) {
  const responses = [];
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (url.origin === origin) {
      responses.push({ path: url.pathname, type: response.request().resourceType(), status: response.status() });
    }
  });
  return responses;
}

/** Total gzipped size (KB) of the responses of one type: 'script' or 'stylesheet'. */
const gzipKB = (responses, type) =>
  kb(responses.filter((r) => r.type === type).reduce((sum, r) => sum + gzipSizeOfBuildFile(r.path), 0));

const isApi = (r) => r.path === '/allmovies' || r.path === '/statistics';

/** One line per measure: name, value, limit. Printed, attached to the report and added to the job summary. */
async function publish(testInfo, title, rows) {
  const lines = [
    `### ${title}`,
    '',
    '| measure | value | limit | |',
    '|---|---|---|---|',
    ...rows.map(([name, value, limit]) => `| ${name} | ${value} | ${limit} | ${value <= limit ? 'ok' : '**OVER**'} |`),
    '',
  ];
  const markdown = lines.join('\n');
  console.log(markdown);
  await testInfo.attach('size-budget.md', { body: markdown, contentType: 'text/markdown' });
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
}

test.describe('size budget (gzipped, own files only)', () => {
  test('the home page loads no more than its budget, and no chart code or flag', async ({ page, baseURL }, testInfo) => {
    const responses = recordSiteResponses(page, new URL(baseURL).origin);

    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="feed-item"]').first()).toBeVisible();

    const measures = {
      jsGzipKB: gzipKB(responses, 'script'),
      cssGzipKB: gzipKB(responses, 'stylesheet'),
      requests: responses.length,
      apiRequests: responses.filter(isApi).length,
      flagRequests: responses.filter((r) => r.path.startsWith('/flags/')).length,
    };
    const limits = budget.home;
    await publish(testInfo, 'Home page: what a first visit downloads', [
      ['JavaScript (KB, gzipped)', measures.jsGzipKB, limits.jsGzipKB],
      ['CSS (KB, gzipped)', measures.cssGzipKB, limits.cssGzipKB],
      ['requests to the site', measures.requests, limits.requests],
      ['API requests', measures.apiRequests, limits.apiRequests],
      ['flag files (before the dropdown is opened)', measures.flagRequests, limits.flagRequests],
    ]);

    expect(responses.filter((r) => r.status >= 400), 'no request to the site may fail').toEqual([]);
    for (const key of Object.keys(limits)) {
      expect(measures[key], `home page: ${key} is over its budget of ${limits[key]}`).toBeLessThanOrEqual(limits[key]);
    }
  });

  test('the statistics page loads its charts on demand, within budget', async ({ page, baseURL }, testInfo) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('[data-testid="feed-item"]').first()).toBeVisible();

    const responses = recordSiteResponses(page, new URL(baseURL).origin); // from now on: what the navigation costs
    // The page asks for its data after the click: wait for those two answers explicitly.
    // (waitForLoadState('networkidle') returns at once when the page already was idle, so it
    // cannot be used to wait for requests started by navigating inside the app.)
    const answered = (pathname) => page.waitForResponse((r) => new URL(r.url()).pathname === pathname);
    const data = Promise.all([answered('/allmovies'), answered('/statistics')]);
    await page.getByRole('link', { name: 'Movies Statistics' }).click();
    await data;
    // and for something only the statistics page has: the home page's sidebar also says "Release years"
    await expect(page).toHaveURL(/\/statistics$/);
    await expect(page.locator('.recharts-surface').first()).toBeVisible({ timeout: 20000 });

    const js = responses.filter((r) => r.type === 'script');
    const measures = { extraJsGzipKB: gzipKB(responses, 'script'), apiRequests: responses.filter(isApi).length };
    const limits = budget.statistics;
    await publish(testInfo, 'Statistics page: what opening it adds to the home page', [
      ['extra JavaScript (KB, gzipped): the charts', measures.extraJsGzipKB, limits.extraJsGzipKB],
      ['API requests', measures.apiRequests, limits.apiRequests],
    ]);

    expect(responses.filter((r) => r.status >= 400), 'no request to the site may fail').toEqual([]);
    expect(js.length, 'the charts must be a separate download (a lazy chunk)').toBeGreaterThan(0);
    for (const key of Object.keys(limits)) {
      expect(measures[key], `statistics page: ${key} is over its budget of ${limits[key]}`).toBeLessThanOrEqual(limits[key]);
    }
  });
});
