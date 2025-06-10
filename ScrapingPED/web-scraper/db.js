const mongoose = require('mongoose');
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

async function saveToDatabase(data) {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/scraper';
  console.log('Using MongoDB URI:', uri.replace(/:.*@/, ':****@'));
  try {
    await mongoose.connect(uri);
    const doc = new Education(data);
    await doc.save();
    console.log(`Saved data for ${data.name} to database`);
  } catch (error) {
    console.error(`Database error for ${data.name}: ${error.message}`);
  } finally {
    await mongoose.disconnect();
  }
}

module.exports = { saveToDatabase };