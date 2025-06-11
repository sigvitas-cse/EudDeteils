const puppeteer = require('puppeteer');
const config = require('./config/config');
const { saveDebugFiles } = require('./utils/utils');

async function trySearchName(page, name) {
  let educationText = 'NA';
  const nameParts = name.split(' ').filter(part => part);
  const searchAttempts = [
    name, // Full name: "x y z"
    nameParts.length >= 2 ? nameParts.slice(0, 2).join(' ') : null, // First two: "x y"
    nameParts[0] // First: "x"
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

    console.log('Locating profile link/image...');
    let linkClicked = false;
    for (const selector of config.PROFILE_LINK_SELECTORS) {
      try {
        await page.waitForSelector(selector, { timeout: 15000 });
        const elements = await page.$$(selector);
        console.log(`Found ${elements.length} elements for selector "${selector}"`);

        // Special case: If only one image is found for this search term, click it directly
        if (elements.length === 1 && searchTerm !== name) { // Only for "x y" or "x", not full name
          await elements[0].click();
          console.log(`Clicked single profile image: ${selector}`);
          linkClicked = true;
          break;
        }

        // For multiple results or full name search, verify name in h3
        for (const element of elements) {
          const href = await element.evaluate(el => el.getAttribute('href') || '');
          const parentId = await element.evaluate(el => {
            const parent = el.closest('[id^="people-"]');
            return parent ? parent.id : null;
          });

          if (!parentId) continue;

          const h3Selector = `#${parentId} > div > h3`;
          const h3Text = await page.evaluate(sel => {
            const element = document.querySelector(sel);
            return element ? element.innerText.toLowerCase() : '';
          }, h3Selector);

          const firstTwoNameParts = nameParts.length >= 2 ? nameParts.slice(0, 2).map(part => part.toLowerCase()) : [nameParts[0].toLowerCase()];
          const h3Words = h3Text.split(' ').filter(word => word);
          const nameMatch = firstTwoNameParts.every(part => h3Words.some(word => word.includes(part)));

          if (nameMatch) {
            await element.click();
            console.log(`Clicked profile image: ${selector} (href: ${href}, h3: ${h3Text})`);
            linkClicked = true;
            break;
          } else {
            console.log(`No name match for "${searchTerm}" in h3: ${h3Text}`);
          }
        }
        if (linkClicked) break;
      } catch (err) {
        console.warn(`Selector ${selector} not found for "${searchTerm}": ${err.message}`);
      }
    }

    if (!linkClicked) {
      console.log(`No profile link/image found for "${searchTerm}"`);
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
        return element ? element.innerText : ',NA';
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
  const { Name, Education } = require('./DB/schemas'); // Corrected to match your directory
  const { ensureDebugFolder } = require('./utils/utils');

  let browser;
  try {
    if (!config.MONGODB_URI) {
      throw new Error('MONGODB_URI is not defined in .env');
    }
    console.log('MongoDB URI:', config.MONGODB_URI.replace(/:.*@/, ':****@'));

    await ensureDebugFolder(config.DEBUG_PATH);
    await mongoose.connect(config.MONGODB_URI);

    // Get all names and processed names
    const names = await Name.find({}).sort({ name: 1 }); // Sort to ensure consistent order
    const processedNames = await Education.find({}, 'name').lean();
    const processedNameSet = new Set(processedNames.map(doc => doc.name));
    const unprocessedNames = names.filter(nameDoc => !processedNameSet.has(nameDoc.name));
    
    console.log(`Found ${names.length} names in "names2" collection`);
    console.log(`Found ${processedNames.length} processed names in "education" collection`);
    console.log(`Processing ${unprocessedNames.length} unprocessed names`);

    if (unprocessedNames.length === 0) {
      console.log('All names have been processed. Exiting.');
      return;
    }

    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: null
    });

    for (let i = 0; i < unprocessedNames.length; i += config.BATCH_SIZE) {
      const batch = unprocessedNames.slice(i, i + config.BATCH_SIZE);
      console.log(`Processing batch ${i / config.BATCH_SIZE + 1} of ${Math.ceil(unprocessedNames.length / config.BATCH_SIZE)}`);

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