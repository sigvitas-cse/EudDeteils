const puppeteer = require('puppeteer');

async function scrapeProfile() {
  let browser;
  try {
    console.log('Launching browser...');
    browser = await puppeteer.launch({
      headless: false, // Visible browser window
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      defaultViewport: null
    });
    const page = await browser.newPage();
    console.log('Navigating to https://www.foley.com/people/...');
    await page.goto('https://www.foley.com/people/', { waitUntil: 'domcontentloaded' });

    console.log('Locating search box...');
    await page.waitForSelector('#filter-search-input', { timeout: 10000 });
    console.log('Entering "Moore Gage E" into search box...');
    await page.type('#filter-search-input', 'Moore Gage E');

    console.log('Pressing Enter to submit search...');
    await page.keyboard.press('Enter');

    console.log('Waiting for search results...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Locating image with selector #people-107952 > div > img...');
    await page.waitForSelector('#people-107952 > div > img', { timeout: 10000 });
    console.log('Clicking the image...');
    await page.click('#people-107952 > div > img');

    console.log('Waiting for profile page...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('Locating education section...');
    await page.waitForSelector('#page > article > div.people-single__content > div.people-single__content-sidebar > div.people-single__content-sidebar-item.people-single__content-sidebar-item--education', { timeout: 10000 });
    console.log('Extracting text from education section...');
    const educationText = await page.evaluate(() => {
      const element = document.querySelector('#page > article > div.people-single__content > div.people-single__content-sidebar > div.people-single__content-sidebar-item.people-single__content-sidebar-item--education');
      return element ? element.innerText : 'Education section not found';
    });

    console.log('Education section text:', educationText);
    console.log('Waiting 5 seconds to observe the profile page...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    await browser.close();
    console.log('Browser closed.');
    return { 
      status: 'success', 
      message: 'Entered "Moore Gage E", submitted search, clicked image, and extracted education text',
      educationText 
    };
  } catch (error) {
    if (browser) await browser.close();
    throw error;
  }
}

module.exports = { scrapeProfile };