const mongoose = require('mongoose');
const XLSX = require('xlsx');
require('dotenv').config();

const nameSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  }
});

const Name = mongoose.model('Name', nameSchema, 'namesfoleyhoag');

async function storeNames() {
  const uri = process.env.MONGODB_URI || 'mongodb+srv://darshanbr36:tgnHO951d3j9ZEy1@cluster0.wuehq.mongodb.net/Scraping?retryWrites=true&w=majority&appName=cluster0';
  if (!uri) {
    throw new Error('MONGODB_URI is not defined in .env');
  }
  console.log('MongoDB URI:', uri.replace(/:.*@/, ':****@'));

  try {
    await mongoose.connect(uri);
    console.log('Reading names.xlsx...');
    const workbook = XLSX.readFile(process.env.INPUT_EXCEL_PATH || 'names.xlsx');
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(sheet);
    const names = data.map(row => row.Name);

    console.log(`Inserting ${names.length} names...`);
    await Name.deleteMany({}); // Clear existing names
    await Name.insertMany(names.map(name => ({ name })), { ordered: true });
    console.log('Names stored successfully in MongoDB "names" collection');
  } catch (error) {
    console.error('Error storing names:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('MongoDB disconnected.');
  }
}

storeNames();