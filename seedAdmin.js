const bcrypt   = require('bcryptjs');
const supabase = require('./config/db');
require('dotenv').config();

const seedAdmin = async () => {
  try {
    const soundchimera = await bcrypt.hash('yourpassword', 10);

    const { data, error } = await supabase
      .from('admins')
      .insert([{
        admin_id: 'ADMIN-002',
        name:     'Lance Humpry Andrade',
        email:    'lancehumpryandrade@gmail.com',
        password: soundchimera,
      }])
      .select()
      .single();

    if (error) throw error;
    console.log('✅ Admin created successfully!', data);
  } catch (err) {
    console.error('❌ Error creating admin:', err.message);
  } finally {
    process.exit();
  }
};

seedAdmin();