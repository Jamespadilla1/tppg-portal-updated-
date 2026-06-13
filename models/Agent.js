const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const AgentSchema = new mongoose.Schema({
  agentId:  { type: String, unique: true },
  name:     { type: String, required: true },
  email:    { type: String, required: true, unique: true },
  phone:    { type: String },
  password: { type: String, required: true },
  status:   { type: String, enum: ['pending', 'approved', 'rejected', 'suspended'], default: 'pending' },
  idFront:  { type: String }, // file path or base64
  idBack:   { type: String }, // file path or base64
}, { timestamps: true });

// Auto-generate Agent ID before saving
AgentSchema.pre('save', async function (next) {
  if (!this.agentId) {
    this.agentId = 'AGT-' + String(Date.now()).slice(-5);
  }
  if (this.isModified('password')) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

AgentSchema.methods.matchPassword = async function (entered) {
  return await bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('Agent', AgentSchema);
