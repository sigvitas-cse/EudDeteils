const express = require('express');
const { scrapeEducationForNames } = require('./scraper');
const { readNamesFromExcel } = require('./excel');
const app = express();
const port = 3000;

app.use(express.json());

app.get('/scrape', async (req, res) => {
  try {
    console.log('Scrape endpoint triggered');
    const names = await readNamesFromExcel('names.xlsx');
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