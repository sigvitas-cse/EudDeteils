const puppeteer = require('puppeteer');
const { writeResultsToExcel } = require('./excel');
const { saveToDatabase } = require('./db');
const fs = require('fs').promises;
require('dotenv').config();

async function scrapeEducationForNames(names) {
  const results = [];
  const batchSize = 10;
  let browser;

  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: false,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
      defaultViewport: null
    });

    for (let i = 0; i < names.length; i += batchSize) {
      const batch = names.slice(i, i + batchSize);
      console.log(`Processing batch ${i / batchSize + 1} of ${Math.ceil(names.length / batchSize)}`);

      for (const name of batch) {
        console.log(`Scraping education for ${name}...`);
        let educationText = 'NA';
        let page;
        let retries = 2;

        while (retries > 0) {
          try {
            page = await browser.newPage();
            console.log(`Navigating to https://www.foley.com/people/...`);
            await page.goto('https://www.foley.com/people/', { waitUntil: 'domcontentloaded', timeout: 30000 });

            console.log('Locating search box...');
            await page.waitForSelector('#filter-search-input', { timeout: 10000 });
            console.log(`Entering "${name}" into search box...`);
            await page.type('#filter-search-input', name);
            await page.keyboard.press('Enter');

            console.log('Waiting for search results...');
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Dynamic profile selection
            console.log('Locating profile image...');
            const profileCards = await page.$$('.people-item');
            let imageClicked = false;
            for (const card of profileCards) {
              const cardText = await card.evaluate(el => el.innerText);
              if (cardText.includes(name)) {
                const image = await card.$('a img');
                if (image) {
                  await image.click();
                  console.log(`Clicked profile image for ${name} in matching card`);
                  imageClicked = true;
                  break;
                }
              }
            }

            if (!imageClicked) {
              // Try fallback selectors
              const selectors = [
                '.people-item a img',
                '.people-item__image img',
                '.people-item img:first-child'
              ];
              for (const selector of selectors) {
                try {
                  await page.waitForSelector(selector, { timeout: 10000 });
                  await page.click(selector);
                  console.log(`Clicked profile image with selector: ${selector}`);
                  imageClicked = true;
                  break;
                } catch (err) {
                  console.warn(`Selector ${selector} not found for ${name}: ${err.message}`);
                }
              }
            }

            if (!imageClicked) {
              // Save debug info
              const html = await page.content();
              await fs.writeFile(`debug_${name.replace(/\s/g, '_')}.html`, html);
              console.log(`Saved search results HTML to debug_${name.replace(/\s/g, '_')}.html`);
              await page.screenshot({ path: `debug_${name.replace(/\s/g, '_')}.png` });
              console.log(`Saved screenshot to debug_${name.replace(/\s/g, '_')}.png`);
            } else {
              console.log('Waiting for profile page...');
              await new Promise(resolve => setTimeout(resolve, 2000));

              console.log('Locating education section...');
              const educationSelector = '#page > article > div.people-single__content > div.people-single__content-sidebar > div.people-single__content-sidebar-item.people-single__content-sidebar-item--education';
              try {
                await page.waitForSelector(educationSelector, { timeout: 10000 });
                educationText = await page.evaluate(selector => {
                  const element = document.querySelector(selector);
                  return element ? element.innerText : 'NA';
                }, educationSelector);
                console.log(`Education text for ${name}: ${educationText}`);
              } catch (err) {
                console.log(`No education found for ${name}: ${err.message}`);
              }
            }

            break; // Success or no image, exit retry loop
          } catch (err) {
            console.error(`Attempt ${3 - retries} failed for ${name}: ${err.message}`);
            retries--;
            if (page) await page.close();
            if (retries > 0) {
              console.log(`Retrying (${retries} attempts left)...`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }
          }
        }

        if (page) await page.close();
        const result = { name, education: educationText };
        results.push(result);
        await saveToDatabase(result);
        console.log(`Saved result for ${name}: ${educationText}`);
        await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 1000));
      }

      // Retry Excel write
      let excelRetries = 3;
      while (excelRetries > 0) {
        try {
          await writeResultsToExcel(results, process.env.OUTPUT_EXCEL_PATH || 'results.xlsx');
          console.log(`Batch ${i / batchSize + 1} completed and saved`);
          break;
        } catch (err) {
          console.error(`Excel write attempt ${4 - excelRetries} failed: ${err.message}`);
          excelRetries--;
          if (excelRetries > 0) {
            console.log(`Retrying Excel write (${excelRetries} attempts left)...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          } else {
            console.error('Failed to write to Excel after retries');
          }
        }
      }
    }

    return results;
  } catch (error) {
    console.error('Scraper error:', error);
    throw error;
  } finally {
    if (browser) await browser.close();
    console.log('Browser closed.');
  }
}

module.exports = { scrapeEducationForNames };