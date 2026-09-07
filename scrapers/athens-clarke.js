const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const fs = require('fs');

const PROPERTY_ID_RAW = process.env.PROPERTY_ID || '164C4 F001';
const TAX_YEAR = process.env.TAX_YEAR || '2020';

const normalize = (s) => s.replace(/\s+/g, '').toUpperCase();
const TARGET_MAP_CODE = normalize(PROPERTY_ID_RAW);

async function waitForCloudflare(page) {
  for (let i = 0; i < 6; i++) {
    const title = await page.title().catch(() => '');
    const bodyText = await page.locator('body').innerText().catch(() => '');
    if (/just a moment|checking your browser|cf-browser-verification|attention required/i.test(title + bodyText)) {
      console.log('Cloudflare challenge detected, waiting...');
      await page.waitForTimeout(5000);
    } else {
      break;
    }
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    }
  });
  const page = await context.newPage();

  try {
    console.log('Using PROPERTY_ID:', PROPERTY_ID_RAW, '| TAX_YEAR:', TAX_YEAR);

    await page.goto('https://athensclarkecounty.governmentwindow.com/start.html', {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    await waitForCloudflare(page);
    await page.waitForTimeout(1500);

    // Select tax year dropdown (top-right "TAX YEAR" select)
    const selects = await page.locator('select').all();
    let yearSelected = false;
    for (const sel of selects) {
      const opts = (await sel.locator('option').allTextContents()).map(o => o.trim());
      if (opts.includes(TAX_YEAR)) {
        await sel.selectOption(TAX_YEAR);
        yearSelected = true;
        break;
      }
    }
    if (!yearSelected) throw new Error(`Tax year ${TAX_YEAR} not found in any dropdown`);
    await page.waitForTimeout(500);

    // Fill Map/Parcel/Property ID box
    const mapInput = page.locator(
      'input[placeholder*="Map" i], input[name*="map" i], input#map_code'
    ).first();
    await mapInput.fill(PROPERTY_ID_RAW);
    await page.waitForTimeout(500);

    // Click "Search by Map/Parcel"
    const searchBtn = page.locator(
      'button:has-text("Search by Map/Parcel"), input[value*="Search by Map/Parcel" i]'
    ).first();
    await searchBtn.waitFor({ state: 'visible', timeout: 15000 });
    await searchBtn.click();

    // Map Code Search Results page — slow load (~15s+)
    await page.waitForSelector('text=Map Code Search Results', { timeout: 30000 });
    await waitForCloudflare(page);
    await page.waitForTimeout(1000);

    // Find the row matching exact map code, click its row "Search" button
    const mapRows = await page.locator('table tr').all();
    let matched = false;
    for (const row of mapRows) {
      const rowText = await row.innerText().catch(() => '');
      if (normalize(rowText).includes(TARGET_MAP_CODE)) {
        const rowSearchBtn = row.locator('button:has-text("Search"), input[value="Search" i]');
        if (await rowSearchBtn.count() > 0) {
          await rowSearchBtn.first().click();
          matched = true;
          break;
        }
      }
    }
    if (!matched) throw new Error('No matching map code row found on Map Code Search Results page');

    // Property Tax Search Results page — all years for this parcel
    await page.waitForSelector('text=Property Tax Search Results', { timeout: 30000 });
    await waitForCloudflare(page);
    await page.waitForTimeout(1000);

    // Find row for TAX_YEAR, click its Bill # link
    const billRows = await page.locator('table tr').all();
    let billLink = null;
    for (const row of billRows) {
      const rowText = await row.innerText().catch(() => '');
      if (rowText.trim().startsWith(TAX_YEAR)) {
        const link = row.locator('a').first();
        if (await link.count() > 0) {
          billLink = link;
          break;
        }
      }
    }
    if (!billLink) throw new Error(`No bill row found for tax year ${TAX_YEAR}`);

    await Promise.all([
      page.waitForLoadState('networkidle', { timeout: 25000 }).catch(() => {}),
      billLink.click()
    ]);
    await waitForCloudflare(page);
    await page.waitForTimeout(2000);

    console.log('Final bill page URL:', page.url());

    // Generic label-based extraction from visible page text
    const pageText = await page.locator('body').innerText();
    const grab = (label) => {
      const re = new RegExp(label + '\\s*[:\\-]?\\s*(.+)', 'i');
      const m = pageText.match(re);
      return m ? m[1].split('\n')[0].trim() : null;
    };

    const output = {
      county: 'athens-clarke',
      propertyIdInput: PROPERTY_ID_RAW,
      taxYear: TAX_YEAR,
      pageUrl: page.url(),
      ownerName: grab('(Owner|Deed Name)'),
      propertyAddress: grab('Property Address'),
      mapCode: grab('Map Code'),
      billNumber: grab('Bill\\s*(Number|No\\.?|#)'),
      amountDue: grab('Amount Due'),
      dueDate: grab('Due Date'),
      status: grab('Status'),
      rawText: pageText.slice(0, 5000)
    };

    fs.writeFileSync('output.json', JSON.stringify(output, null, 2));
    console.log(JSON.stringify(output, null, 2));
  } catch (err) {
    console.error('Scraping error:', err.message);
    fs.writeFileSync('output.json', JSON.stringify({ error: err.message }, null, 2));
  }

  await page.screenshot({ path: 'debug.png', fullPage: true }).catch(() => {});
  const html = await page.content().catch(() => '');
  fs.writeFileSync('debug.html', html);

  await browser.close();
})();
