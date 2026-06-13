const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const supabase = require('../config/db');

const generateToken = (id, role) => {
  return jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// POST /api/auth/login
const login = async (req, res) => {
  const { loginId, email, password, role } = req.body;

  try {
    if (role === 'admin') {
      const { data: admin, error } = await supabase
        .from('admins')
        .select('*')
        .eq('admin_id', loginId)
        .eq('email', email)
        .single();

      if (error || !admin) return res.status(400).json({ message: 'Incorrect Admin ID or email.' });

      const match = await bcrypt.compare(password, admin.password);
      if (!match) return res.status(400).json({ message: 'Incorrect password.' });

      return res.json({
        token:   generateToken(admin.id, 'admin'),
        role:    'admin',
        name:    admin.name,
        email:   admin.email,
        adminId: admin.admin_id,
      });
    }

    if (role === 'agent') {
      const { data: agent, error } = await supabase
        .from('agents')
        .select('*')
        .eq('agent_id', loginId)
        .eq('email', email)
        .single();

      if (error || !agent) return res.status(400).json({ message: 'Agent ID not found.' });

      const match = await bcrypt.compare(password, agent.password);
      if (!match)                        return res.status(400).json({ message: 'Incorrect password.' });
      if (agent.status === 'pending')    return res.status(403).json({ message: 'Your application is still under review.' });
      if (agent.status === 'rejected')   return res.status(403).json({ message: 'Your application was rejected. Contact the admin.' });
      if (agent.status === 'suspended')  return res.status(403).json({ message: 'Your account has been suspended.' });

      return res.json({
        token:   generateToken(agent.id, 'agent'),
        role:    'agent',
        name:    agent.name,
        email:   agent.email,
        agentId: agent.agent_id,
        phone:   agent.phone,
      });
    }

    return res.status(400).json({ message: 'Invalid role.' });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

// POST /api/auth/register (agent registration)
const register = async (req, res) => {
  const { name, email, phone, password } = req.body;

  try {
    // Check if email already exists
    const { data: exists } = await supabase
      .from('agents')
      .select('id')
      .eq('email', email)
      .single();

    if (exists) return res.status(400).json({ message: 'Email already registered.' });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate agent ID
    const agentId = 'AGT-' + String(Date.now()).slice(-5);

    const { data: agent, error } = await supabase
      .from('agents')
      .insert([{
        agent_id: agentId,
        name,
        email,
        phone,
        password: hashedPassword,
        id_front: req.files?.idFront?.[0]?.path || '',
        id_back:  req.files?.idBack?.[0]?.path  || '',
        status:   'pending',
      }])
      .select()
      .single();

    if (error) throw error;

    // Log the registration
    await supabase.from('logs').insert([{
      message: `New agent application submitted: ${name} (${agentId})`,
      actor: name,
      role: 'agent',
    }]);

    res.status(201).json({
      message: 'Application submitted.',
      agentId: agent.agent_id,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error.' });
  }
};

module.exports = { login, register };