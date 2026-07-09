const express = require('express');
const cors    = require('cors');
const dotenv  = require('dotenv');
const path    = require('path');

dotenv.config();

const app = express();

// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── SERVE STATIC FILES (your HTML/CSS/JS) ──
app.use(express.static(path.join(__dirname, 'public')));

// ── ROUTES ──
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/agents',     require('./routes/agents'));
app.use('/api/properties', require('./routes/properties'));
app.use('/api/developers', require('./routes/developers'));
app.use('/api/units',      require('./routes/units'));
app.use('/api/sellers',    require('./routes/sellers'));
app.use('/api/buyers',     require('./routes/buyers'));
app.use('/api/logs',       require('./routes/logs'));

// ── START SERVER ──
const supabase = require('./config/db');

app.listen(process.env.PORT || 3000, async () => {
  try {
    const { data, error } = await supabase.from('admins').select('*').limit(1);
    if (error) throw error;
    console.log('✅ Supabase connected');
    console.log(`🚀 Server running on http://localhost:${process.env.PORT || 3000}`);
  } catch (err) {
    console.error('❌ Supabase connection error:', err.message);
  }
});