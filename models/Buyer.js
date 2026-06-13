const mongoose = require('mongoose');

const BuyerSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String },
  phone:    { type: String },
  address:  { type: String },
  property: { type: String }, // property name or ref
}, { timestamps: true });

module.exports = mongoose.model('Buyer', BuyerSchema);
