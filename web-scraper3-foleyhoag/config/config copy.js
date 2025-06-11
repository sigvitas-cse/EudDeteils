require('dotenv').config();

module.exports = {
  MONGODB_URI: process.env.MONGODB_URI,
  WEBSITE_URL: 'https://foleyhoag.com/people/',
  MENU_SELECTOR: '#body > header > div > div.d-none.d-xl-block.header--menu > ul > li:nth-child(1) > a',
  SEARCH_INPUT_SELECTOR: '#searchText',
  NO_RESULTS_SELECTOR: '#updateDivFilter > div > div > p',
  PROFILE_IMAGE_SELECTOR: '#updateDivFilter > div.row.card-stack__items > div:nth-child(1) > div.card-stack__picture > picture > a > img',
  EDUCATION_SELECTOR: '#Overview > div > div > div:nth-child(4)',
  BATCH_SIZE: 10,
  RETRY_COUNT: 2,
  DEBUG_PATH: './debug'
};