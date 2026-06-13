const mongoose = require('mongoose');

const PropertySchema = new mongoose.Schema({
  name:        { type: String, required: true },
  location:    { type: String, required: true },
  price:       { type: Number, required: true },
  rate:        { type: Number, required: true }, // commission rate %
  description: { type: String },
  status:      { type: String, enum: ['Available', 'Reserved', 'Sold'], default: 'Available' },
  date:        { type: Date, default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('Property', PropertySchema);
