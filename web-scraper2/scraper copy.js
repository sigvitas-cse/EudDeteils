const puppeteer = require('puppeteer');
const config = require('./config/config');
const { saveDebugFiles } = require('./utils/utils');

async function trySearchName(page, name) {
  let educationText = 'NA';
  const nameParts = name.split(' ').filter(part => part);
  const searchAttempts = [
    name,
    nameParts.length >= 2 ? nameParts.slice(0, 2).join(' ') : null,
    nameParts[0]
  ].filter(Boolean);

  for (const searchTerm of searchAttempts) {
    console.log(`Searching for "${searchTerm}"...`);
    await page.goto(config.WEBSITE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector(config.SEARCH_INPUT_SELECTOR, { timeout: 15000 });
    await page.type(config.SEARCH_INPUT_SELECTOR, searchTerm);
    await page.keyboard.press('Enter');

    await new Promise(resolve => setTimeout(resolve, 3000));

    const noResults = await page.evaluate(selector => {
      const element = document.querySelector(selector);
      return element && element.innerText.toLowerCase().includes('0 search results for:');
    }, config.NO_RESULTS_SELECTOR);

    if (noResults) {
      console.log(`No results for "${searchTerm}"`);
      continue;
    }

    console.log('Locating profile link...');
    let linkClicked = false;
    for (const selector of config.PROFILE_LINK_SELECTORS) {
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
      await saveDebugFiles(name, searchTerm, html, page);
      continue;
    }

    console.log('Waiting for profile page...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('Locating education section...');
    try {
      await page.waitForSelector(config.EDUCATION_SELECTOR, { timeout: 15000 });
      educationText = await page.evaluate(selector => {
        const element = document.querySelector(selector);
        return element ? element.innerText : 'NA';
      }, config.EDUCATION_SELECTOR);

       // Clean the education text to remove "Education" header
      if (educationText !== 'NA') {
        educationText = educationText
          .split('\n')
          .filter(line => line.trim() && !line.trim().toLowerCase().includes('education'))
          .join('\n')
          .trim();
        if (!educationText) educationText = 'NA'; // Fallback if all lines are filtered out
      }
      
      console.log(`Education text for "${searchTerm}": ${educationText}`);
      return educationText;
    } catch (err) {
      console.log(`No education found for "${searchTerm}": ${err.message}`);
      return 'NA';
    }
  }

  return educationText;
}

async function scrapeEducation() {
  const mongoose = require('mongoose');
  const { Name, Education } = require('./DB/schemas');
  const { ensureDebugFolder } = require('./utils/utils');

  let browser;
  try {
    if (!config.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in .env');
    }
    console.log('MongoDB URI:', config.MONGODB_URI.replace(/:.*@/, ':****@'));

    await ensureDebugFolder(config.DEBUG_PATH);
    await mongoose.connect(config.MONGODB_URI);
    const names = await Name.find({});
    console.log(`Found ${names.length} names in "names" collection`);

    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: null
    });

    for (let i = 0; i < names.length; i += config.BATCH_SIZE) {
      const batch = names.slice(i, i + config.BATCH_SIZE);
      console.log(`Processing batch ${i / config.BATCH_SIZE + 1} of ${Math.ceil(names.length / config.BATCH_SIZE)}`);

      for (const { name } of batch) {
        console.log(`Scraping education for ${name}...`);
        let educationText = 'NA';
        let page;
        let retries = config.RETRY_COUNT;

        while (retries > 0) {
          try {
            page = await browser.newPage();
            educationText = await trySearchName(page, name);
            break;
          } catch (err) {
            console.error(`Attempt ${config.RETRY_COUNT - retries + 1} failed for ${name}: ${err.message}`);
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

module.exports = { scrapeEducation };