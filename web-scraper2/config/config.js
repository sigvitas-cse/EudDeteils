require('dotenv').config();

module.exports = {
  MONGODB_URI: process.env.MONGODB_URI,
  WEBSITE_URL: 'https://www.knobbe.com/',
  MENU_SELECTOR: '#menu-item-24821',
  SEARCH_INPUT_SELECTOR: '#main > div.intro-section > div > div.facetwp-facet.facetwp-facet-professionals_search.facetwp-type-search > span > span > input',
  NO_RESULTS_SELECTOR: '#facetwp-top-professionals > div.facetwp-template > div > p',
  PROFILE_IMAGE_SELECTOR: '#professionalGrid > a > div.image-container > img',
  EDUCATION_SELECTOR: '#overview > div > div > section > div.copy-section.links-underlined > div.education-section.content-en',
  BATCH_SIZE: 10,
  RETRY_COUNT: 2,
  DEBUG_PATH: './debug'
};