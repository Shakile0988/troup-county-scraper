const { chromium } = require('playwright');
const fs = require('fs');

const PROPERTY_ID_RAW = process.env.PROPERTY_ID || '0231 000 047';
const TAX_YEAR = process.env.TAX_YEAR || '2020';

// Jodi property id te space na thake, format kore dei
const PROPERTY_ID = /^\d+$/.test(PROPERTY_ID_RAW.replace(/\s/g, '')) && !PROPERTY_ID_RAW.includes(' ')
  ? PROPERTY_ID_RAW.replace(/^(\d{4})(\d{3})(\d+)$/, '$1 $2 $3')
  : PROPERTY_ID_RAW;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  let billDetailsResponse = null;

  page.on('response', async (response) => {
    if (response.url().includes('/api/bill-details') && response.request().method() === 'POST') {
      try {
        billDetailsResponse = await response.json();
      } catch (e) {
        console.log('Could not parse bill-details response:', e.message);
      }
    }
  });

  try {
    console.log('Using PROPERTY_ID:', PROPERTY_ID, '| TAX_YEAR:', TAX_YEAR);

    await page.goto('https://pay.troupcountytax.com/details', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    const selects = await page.locator('select').all();
    console.log(`Found ${selects.length} select dropdowns`);

    let searchBySelect = null;
    let taxYearSelect = null;

    for (const sel of selects) {
      const optionsText = await sel.locator('option').allTextContents();
      const optionsJoined = optionsText.join(',');
      console.log('Select options:', optionsJoined);

      if (optionsJoined.includes('Property Id') && optionsJoined.includes('Owner Name')) {
        searchBySelect = sel;
      } else if (optionsText.some(t => /^\d{4}$/.test(t.trim()))) {
        taxYearSelect = sel;
      }
    }

    if (!searchBySelect || !taxYearSelect) {
      throw new Error(`Could not identify selects. searchBySelect=${!!searchBySelect}, taxYearSelect=${!!taxYearSelect}`);
    }

    // Step 1: Search By -> Property Id
    await searchBySelect.selectOption({ label: 'Property Id' });
    await page.waitForTimeout(500);

    // Step 2: Search Term input
    const searchTermInput = page.locator('input[type="text"]').first();
    await searchTermInput.fill(PROPERTY_ID);
    await page.waitForTimeout(500);

    // Step 3: Tax Year select
    await taxYearSelect.selectOption(TAX_YEAR);
    await page.waitForTimeout(500);

    // Step 4: SEARCH button - eta <input type="submit"> , <button> na
    const searchButton = page.locator('input[type="submit"][value="SEARCH"]:visible').first();
    await searchButton.waitFor({ state: 'visible', timeout: 15000 });
    await searchButton.click();
    await page.waitForTimeout(3000);

    console.log('Search clicked, current URL:', page.url());

    // Debug: result table koyta row asche dekhi
    const rowCount = await page.locator('table tbody tr').count();
    console.log('Result table row count:', rowCount);

    // Step 5: View button (first result row)
    const viewButton = page.locator('button, a').filter({ hasText: /view/i }).first();
    await viewButton.waitFor({ state: 'visible', timeout: 15000 });
    await viewButton.click();
    await page.waitForTimeout(2000);

    // Step 6: Popup close if present
    const closeBtn = page.locator('button:has-text("Close")');
    if (await closeBtn.count() > 0) {
      await closeBtn.first().click();
      await page.waitForTimeout(1000);
    }

    // Step 7: Wait for bill-details API response
    let waited = 0;
    while (!billDetailsResponse && waited < 15000) {
      await page.waitForTimeout(500);
      waited += 500;
    }

  } catch (err) {
    console.error('Scraping error:', err.message);
    await page.screenshot({ path: 'debug.png', fullPage: true }).catch((e) => console.log('screenshot failed:', e.message));
    const html = await page.content().catch(() => '');
    fs.writeFileSync('debug.html', html);
  }

  await browser.close();

  const output = billDetailsResponse || { error: 'No data captured' };
  fs.writeFileSync('output.json', JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
})();
