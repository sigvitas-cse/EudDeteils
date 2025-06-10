const mongoose = require('mongoose');

const nameSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  }
});

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

module.exports = {
  Name: mongoose.model('Name', nameSchema, 'names'),
  Education: mongoose.model('Education', educationSchema, 'education')
};