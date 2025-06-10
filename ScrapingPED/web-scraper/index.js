const express = require('express');
const { scrapeEducationForNames } = require('./scraper');
const { readNamesFromExcel } = require('./excel');
require('dotenv').config();
const app = express();
const port = 3000;

app.use(express.json());

app.get('/scrape', async (req, res) => {
  try {
    console.log('Scrape endpoint triggered');
    const inputPath = process.env.INPUT_EXCEL_PATH || 'names.xlsx';
    const names = await readNamesFromExcel(inputPath);
    const result = await scrapeEducationForNames(names);
    res.json({ status: 'success', message: 'Scraping completed', results: result.length });
  } catch (error) {
    console.error('Error in /scrape endpoint:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});