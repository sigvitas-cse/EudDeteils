const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

// Ensure debug folder exists
async function ensureDebugFolder() {
  const debugPath = path.join(__dirname, 'debug');
  try {
    await fs.mkdir(debugPath, { recursive: true });
    console.log('Debug folder ready');
  } catch (err) {
    console.error('Error creating debug folder:', err.message);
  }
}

// Schemas
const nameSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  }
});

const educationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  education: {
    type: String,
    required: true,
    default: 'NA'
  }
});

const Name = mongoose.model('Name', nameSchema, 'names');
const Education = mongoose.model('Education', educationSchema, 'education');

async function scrapeEducation() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in .env');
  }
  console.log('MongoDB URI:', uri.replace(/:.*@/, ':****@'));

  let browser;
  try {
    await ensureDebugFolder();
    await mongoose.connect(uri);
    const names = await Name.find({});
    console.log(`Found ${names.length} names in "names" collection`);

    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: null
    });

    const batchSize = 10;
    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(names.length / batchSize)}`);

      for (const { name } of batch) {
        console.log(`Scraping education for ${name}...`);
        let educationText = 'NA';
        let page;
        let retries = 2;

        while (retries > 0) {
          try {
            page = await browser.newPage();
            educationText = await trySearchName(page, name);
            break;
          } catch (err) {
            console.error(`Attempt ${3 - retries} failed for ${name}: ${err.message}`);
            retries--;
            if (page) {
              try {
                await page.close();
              } catch (closeErr) {
                console.warn(`Error closing page: ${closeErr.message}`);
              }
            }
            if (retries > 0) {
              console.log(`Retrying (${retries} attempts left)...`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }
        }

        if (page) {
          try {
            await page.close();
          } catch (closeErr) {
            console.warn(`Error closing page: ${closeErr.message}`);
          }
        }
        await Education.updateOne({ name }, { name, education: educationText }, { upsert: true });
        console.log(`Saved result for ${name}: ${educationText}`);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 1000));
      }
    }
  } catch (error) {
    console.error('Scraper error:', error);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        console.warn(`Error closing browser: ${closeErr.message}`);
      }
    }
    console.log('Browser closed.');
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

async function trySearchName(page, name) {
  let educationText = 'NA';
  const nameParts = name.split(' ').filter(part => part);
  const searchAttempts = [
    name, // Full name: "A B C"
    nameParts.length >= 2 ? nameParts.slice(0, 2).join(' ') : null, // First two: "A B"
    nameParts[0] // First: "A"
  ].filter(Boolean);

  for (const searchTerm of searchAttempts) {
    console.log(`Searching for "${searchTerm}"...`);
    await page.goto('https://www.foley.com/people/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('#filter-search-input', { timeout: 15000 });
    await page.type('#filter-search-input', searchTerm);
    await page.keyboard.press('Enter');

    console.log('Waiting for search results...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check for "0 search results for:"
    const noResultsSelector = '#eight29-filters > div > div > div > div > p';
    const noResults = await page.evaluate(selector => {
      const element = document.querySelector(selector);
      return element && element.innerText.toLowerCase().includes('0 search results for:');
    }, noResultsSelector);

    if (noResults) {
      console.log(`No results for "${searchTerm}"`);
      continue;
    }

    // Try to find profile link
    console.log('Locating profile link...');
    let linkClicked = false;
    const selectors = [
      'a[href*="/people/"]', // Remove :first-of-type to check all links
      '.people-item__link',
      '.people-item a'
    ];
    for (const selector of selectors) {
      try {
        await page.waitForSelector(selector, { timeout: 15000 });
        const elements = await page.$$(selector);
        for (const element of elements) {
          const href = await element.evaluate(el => el.getAttribute('href') || '');
          const text = await element.evaluate(el => el.innerText);
          const normalizedName = name.toLowerCase().replace(/\s/g, '-');
          if (text.includes(name) || href.includes(normalizedName) || href.includes(searchTerm.toLowerCase().replace(/\s/g, '-'))) {
            await element.click();
            console.log(`Clicked profile: ${selector} (href: ${href})`);
            linkClicked = true;
            break;
          }
        }
        if (linkClicked) break;
      } catch (err) {
        console.warn(`Selector ${selector} not found for "${searchTerm}": ${err.message}`);
      }
    }

    if (!linkClicked) {
      console.log(`No profile link found for "${searchTerm}"`);
      const html = await page.content();
      await fs.writeFile(`debug/${name.replace(/\s/g, '_')}_${searchTerm.replace(/\s/g, '_')}.html`, html);
      console.log(`Saved HTML to debug/${name.replace(/\s/g, '_')}_${searchTerm.replace(/\s/g, '_')}.html`);
      await page.screenshot({ path: `debug/${name.replace(/\s/g, '_')}_${searchTerm.replace(/\s/g, '_')}.png` });
      console.log(`Saved screenshot to debug/${name.replace(/\s/g, '_')}_${searchTerm.replace(/\s/g, '_')}.png`);
      continue;
    }

    // Profile page loaded
    console.log('Waiting for profile page...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('Locating education section...');
    const educationSelector = '#page > article > div.people-single__content > div.people-single__content-sidebar > div.people-single__content-sidebar-item--education';
    try {
      await page.waitForSelector(educationSelector, { timeout: 15000 });
      educationText = await page.evaluate(selector => {
        const element = document.querySelector(selector);
        return element ? element.innerText : 'NA';
      }, educationSelector);
      console.log(`Education text for "${searchTerm}": ${educationText}`);
      return educationText; // Stop further searches
    } catch (err) {
      console.log(`No education found for "${searchTerm}": ${err.message}`);
      return 'NA';
    }
  }

  return educationText; // All searches failed
}

scrapeEducation();