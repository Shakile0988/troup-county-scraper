const { chromium } = require('playwright');
const fs = require('fs');

// ==== INPUT: GitHub Actions theke environment variable hisebe asbe ====
const PROPERTY_ID = process.env.PROPERTY_ID || '0231 000 047';
const TAX_YEAR = process.env.TAX_YEAR || '2020';

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  let billDetailsResponse = null;

  // Network response capture kora - bill-details API response dhorar jonno
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
    // Step 1: Search page e jawa
    await page.goto('https://pay.troupcountytax.com/details', { waitUntil: 'networkidle', timeout: 60000 });

    // Step 2: "Search By" dropdown theke "Property Id" select kora
    await page.locator('text=Search By').locator('..').locator('select, [role="combobox"]').first().click();
    await page.waitForTimeout(500);
    await page.locator('text=Property Id').click();
    await page.waitForTimeout(500);

    // Step 3: Search Term box e Property ID input dewa
    const searchTermInput = page.locator('input').filter({ hasText: '' }).nth(0);
    await page.fill('input[placeholder*="0601"]', PROPERTY_ID).catch(async () => {
      // fallback: dwitiyo input field
      const inputs = await page.locator('input[type="text"]').all();
      if (inputs.length > 0) await inputs[1].fill(PROPERTY_ID);
    });

    // Step 4: Tax Year dropdown select kora
    await page.locator('text=Tax Year').locator('..').locator('select, [role="combobox"]').first().click();
    await page.waitForTimeout(500);
    await page.locator(`text="${TAX_YEAR}"`).first().click();
    await page.waitForTimeout(500);

    // Step 5: Search button e click kora
    await page.locator('button:has-text("SEARCH")').click();
    await page.waitForTimeout(3000);

    // Step 6: Result row theke "View" button e click kora
    await page.locator('button:has-text("View"), a:has-text("View")').first().click();
    await page.waitForTimeout(2000);

    // Step 7: Jodi popup ase, seta close kora
    const closeBtn = page.locator('button:has-text("Close"), button:has-text("×")');
    if (await closeBtn.count() > 0) {
      await closeBtn.first().click();
      await page.waitForTimeout(1000);
    }

    // Step 8: bill-details API response asa porjonto wait kora
    let waited = 0;
    while (!billDetailsResponse && waited < 15000) {
      await page.waitForTimeout(500);
      waited += 500;
    }

  } catch (err) {
    console.error('Scraping error:', err.message);
  }

  await browser.close();

  // Output file e result lekha
  const output = billDetailsResponse || { error: 'No data captured' };
  fs.writeFileSync('output.json', JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
})();
