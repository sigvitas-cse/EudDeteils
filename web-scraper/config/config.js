require('dotenv').config();

module.exports = {
  MONGODB_URI: process.env.MONGODB_URI,
  WEBSITE_URL: 'https://www.foley.com/people/',
  SEARCH_INPUT_SELECTOR: '#filter-search-input',
  NO_RESULTS_SELECTOR: '#eight29-filters > div > div > div > div > p',
  PROFILE_LINK_SELECTORS: [
    'a[href*="/people/"]',
    '.people-item__link',
    '.people-item a'
  ],
  EDUCATION_SELECTOR: '#page > article > div.people-single__content > div.people-single__content-sidebar > div.people-single__content-sidebar-item--education',
  BATCH_SIZE: 10,
  RETRY_COUNT: 2,
  DEBUG_PATH: './debug'
};