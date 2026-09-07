const county = (process.env.COUNTY || '').toLowerCase().trim();

const countyMap = {
  'troup': './scrapers/troup.js',
  'athens-clarke': './scrapers/athens-clarke.js',
};

const scraperPath = countyMap[county];

if (!scraperPath) {
  console.error(`Unknown county: "${county}". Available: ${Object.keys(countyMap).join(', ')}`);
  process.exit(1);
}

console.log(`Routing to county: ${county}`);
require(scraperPath);
