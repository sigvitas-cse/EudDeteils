const express = require('express');
const { scrapeProfile } = require('./scraper');
const app = express();
const port = 3000;

app.use(express.json());

app.get('/scrape', async (req, res) => {
  try {
    console.log('Scrape endpoint triggered');
    const result = await scrapeProfile();
    res.json(result);
  } catch (error) {
    console.error('Error in /scrape endpoint:', error);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});