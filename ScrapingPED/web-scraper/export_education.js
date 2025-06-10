const mongoose = require('mongoose');
const XLSX = require('xlsx');
require('dotenv').config();

const educationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  education: {
    type: String,
    required: true,
    default: 'NA'
  }
});

const Education = mongoose.model('Education', educationSchema, 'education');

async function exportEducationToExcel() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in .env');
  }
  console.log('MongoDB URI:', uri.replace(/:.*@/, ':****@'));

  try {
    await mongoose.connect(uri);
    console.log('Fetching data from education collection...');
    const records = await Education.find({}).lean();

    if (records.length === 0) {
      console.log('No data found in education collection.');
      return;
    }

    console.log(`Found ${records.length} records`);

    // Prepare data for Excel
    const data = records.map(record => ({
      Name: record.name,
      Education: record.education
    }));

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Education');

    // Set column widths
    worksheet['!cols'] = [
      { wch: 20 }, // Name
      { wch: 100 } // Education
    ];

    const outputPath = 'education_results.xlsx';
    let retries = 3;
    while (retries > 0) {
      try {
        XLSX.writeFile(workbook, outputPath);
        console.log(`Data exported successfully to ${outputPath}`);
        break;
      } catch (err) {
        console.error(`Excel write attempt ${4 - retries} failed: ${err.message}`);
        retries--;
        if (retries > 0) {
          console.log(`Retrying Excel write (${retries} attempts left)...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          console.error('Failed to write to Excel after retries');
        }
      }
    }
  } catch (error) {
    console.error('Export error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

exportEducationToExcel();