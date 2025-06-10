const XLSX = require('xlsx');

function readNamesFromExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet);
  return data.map(row => row.Name); // Assumes "Name" column
}

async function writeResultsToExcel(results, filePath) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(results);
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Results');
  XLSX.writeFile(workbook, filePath);
}

module.exports = { readNamesFromExcel, writeResultsToExcel };