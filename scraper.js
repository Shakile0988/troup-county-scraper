const { chromium } = require('playwright');
const fs = require('fs');

const PROPERTY_ID = process.env.PROPERTY_ID || '0231 000 047';
const TAX_YEAR = process.env.TAX_YEAR || '2020';

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
    await page.goto('https://pay.troupcountytax.com/details', { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);

    // Step 1: "Search By" select dropdown -> "Property Id" select kora
    const searchBySelect = page.locator('select').nth(0);
    await searchBySelect.selectOption({ label: 'Property Id' });
    await page.waitForTimeout(500);

    // Step 2: Search Term input box e Property ID likha
    const searchTermInput = page.locator('input[type="text"]').first();
    await searchTermInput.fill(PROPERTY_ID);
    await page.waitForTimeout(500);

    // Step 3: Tax Year select dropdown
    const selects = await page.locator('select').all();
    if (selects.length > 1) {
      await selects[1].selectOption(TAX_YEAR);
    } else {
      // fallback: find select near "Tax Year" text
      await page.locator('select').filter({ hasText: '' }).nth(-1).selectOption(TAX_YEAR).catch(() => {});
    }
    await page.waitForTimeout(500);

    // Step 4: SEARCH button
    await page.locator('button:has-text("SEARCH")').click();
    await page.waitForTimeout(3000);

    // Step 5: View button (first result row)
    await page.locator('button:has-text("View"), a:has-text("View")').first().click();
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
    // Debug: page er screenshot o html save kori jate bujha jay ki obostha
    await page.screenshot({ path: 'debug.png', fullPage: true }).catch(() => {});
    const html = await page.content().catch(() => '');
    fs.writeFileSync('debug.html', html);
  }

  await browser.close();

  const output = billDetailsResponse || { error: 'No data captured' };
  fs.writeFileSync('output.json', JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
})();
