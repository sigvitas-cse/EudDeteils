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

    // Wait for the search input to appear
    try {
      await page.waitForSelector(config.SEARCH_INPUT_SELECTOR, { visible: true, timeout: 15000 });
      await page.type(config.SEARCH_INPUT_SELECTOR, searchTerm);
      await page.keyboard.press('Enter');
      console.log(`Entered search term: ${searchTerm}`);
    } catch (err) {
      console.error(`Failed to interact with search input for "${searchTerm}": ${err.message}`);
      const html = await page.content();
      await saveDebugFiles(name, searchTerm, html, page, 'search-input-failure');
      continue;
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check for no results
    const noResults = await page.evaluate(selector => {
      const element = document.querySelector(selector);
      return element && element.innerText.toLowerCase().includes('no results');
    }, config.NO_RESULTS_SELECTOR);

    if (noResults) {
      console.log(`No results for "${searchTerm}"`);
      continue;
    }

    console.log('Locating profile image...');
    let linkClicked = false;
    try {
      await page.waitForSelector(config.PROFILE_IMAGE_SELECTOR, { visible: true, timeout: 15000 });
      const elements = await page.$$(config.PROFILE_IMAGE_SELECTOR);
      console.log(`Found ${elements.length} profile images`);

      // Special case: If only one image is found, click it directly (except for full name search)
      if (elements.length === 1 && searchTerm !== name) {
        await elements[0].click();
        console.log('Clicked single profile image');
        linkClicked = true;
      } else {
        // For multiple results or full name search, verify name against full name "x y z"
        const profileLinks = await page.$$('#updateDivFilter > div.row.card-stack__items > div');
        for (let i = 0; i < profileLinks.length; i++) {
          const nameSelector = `#updateDivFilter > div.row.card-stack__items > div:nth-child(${i + 1}) > div.content-wrapper.pt-4.pb-3 > h6 > a`;
          const profileName = await page.evaluate(sel => {
            const element = document.querySelector(sel);
            return element ? element.innerText.toLowerCase() : '';
          }, nameSelector);

          // Compare profile name against full name, requiring first two parts ("x y" or "y x")
          const firstTwoNameParts = nameParts.length >= 2 ? nameParts.slice(0, 2).map(part => part.toLowerCase()) : [nameParts[0].toLowerCase()];
          const profileNameWords = profileName.split(' ').filter(word => word);
          const nameMatch = firstTwoNameParts.every(part => profileNameWords.some(word => word.includes(part)));

          if (nameMatch) {
            const imageSelector = `#updateDivFilter > div.row.card-stack__items > div:nth-child(${i + 1}) > div.card-stack__picture > picture > a > img`;
            await page.click(imageSelector);
            console.log(`Clicked profile image for "${profileName}" (matched "${name}")`);
            linkClicked = true;
            break;
          } else {
            console.log(`No name match for "${searchTerm}" in profile name: ${profileName}`);
          }
        }
      }

      if (!linkClicked) {
        console.log(`No matching profile image found for "${searchTerm}"`);
        const html = await page.content();
        await saveDebugFiles(name, searchTerm, html, page, 'no-profile-image');
        continue;
      }

      console.log('Waiting for profile page...');
      await new Promise(resolve => setTimeout(resolve, 3000));

      console.log('Locating education section...');
      try {
        await page.waitForSelector(config.EDUCATION_SELECTOR, { visible: true, timeout: 15000 });
        educationText = await page.evaluate(selector => {
          const element = document.querySelector(selector);
          if (!element) return ',NA';
          // Target the second div for education details, excluding the h3 heading
          const details = element.querySelector(':scope > div:nth-child(2) > div');
          if (!details) return ',NA';
          const children = Array.from(details.childNodes);
          return children
            .filter(node => node.nodeName !== 'H3')
            .map(node => node.textContent.trim())
            .filter(text => text)
            .join('\n')
            .trim();
        }, config.EDUCATION_SELECTOR);

        if (!educationText) educationText = 'No results';
        console.log(`Education text for ${name}: ${educationText}`);
        return educationText;
      } catch (err) {
        console.log(`No education found for "${name}": ${err.message}`);
        return 'No results';
      }
    } catch (err) {
      console.warn(`Error finding profile images for "${searchTerm}": ${err.message}`);
      const html = await page.content();
      await saveDebugFiles(name, searchTerm, html, page, 'profile-image-failure');
      continue;
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
      throw new Error('MongoDB_URI is not defined in .env');
    }
    console.log('MongoDB URI:', config.MONGODB_URI.replace(/:.*@/, ':****@'));

    await ensureDebugFolder(config.DEBUG_PATH);
    await mongoose.connect(config.MONGODB_URI);

    const names = await Name.find({}).sort({ name: 1 });
    const processedNames = await Education.find({}, 'name').lean();
    const processedNameSet = new Set(processedNames.map(doc => doc.name));
    const unprocessedNames = names.filter(nameDoc => !processedNameSet.has(nameDoc.name));

    console.log(`Found ${names.length} names in "names" collection`);
    console.log(`Found ${processedNames.length} processed names in 'education' collection`);
    console.log(`Processing ${unprocessedNames.length} unprocessed names`);

    if (unprocessedNames.length === 0) {
      console.log('All names have been processed. Exiting.');
      return;
    }

    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: { width: 1920, height: 1080 }
    });

    for (let i = 0; i < unprocessedNames.length; i += config.BATCH_SIZE) {
      const batch = unprocessedNames.slice(i, i + config.BATCH_SIZE);
      console.log(`Processing batch ${i / config.BATCH_SIZE + 1} of ${Math.ceil(unprocessedNames.length / config.BATCH_SIZE)}`);

      for (const { name } of batch) {
        console.log(`Scraping education for ${name}...`);
        let educationText = 'No results';
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