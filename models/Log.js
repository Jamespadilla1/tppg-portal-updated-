const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
  message:  { type: String, required: true },
  actor:    { type: String }, // who did the action
  role:     { type: String }, // admin or agent
}, { timestamps: true });

module.exports = mongoose.model('Log', LogSchema);
