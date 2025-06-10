const fs = require('fs').promises;
const path = require('path');

async function ensureDebugFolder(debugPath) {
  try {
    await fs.mkdir(debugPath, { recursive: true });
    console.log('Debug folder ready');
  } catch (err) {
    console.error('Error creating debug folder:', err.message);
  }
}

async function saveDebugFiles(name, searchTerm, html, page) {
  const safeName = name.replace(/\s/g, '_');
  const safeSearchTerm = searchTerm.replace(/\s/g, '_');
  const htmlPath = path.join('debug', `${safeName}_${safeSearchTerm}.html`);
  const screenshotPath = path.join('debug', `${safeName}_${safeSearchTerm}.png`);

  try {
    await fs.writeFile(htmlPath, html);
    console.log(`Saved HTML to ${htmlPath}`);
    await page.screenshot({ path: screenshotPath });
    console.log(`Saved screenshot to ${screenshotPath}`);
  } catch (err) {
    console.error(`Error saving debug files: ${err.message}`);
  }
}

module.exports = { ensureDebugFolder, saveDebugFiles };