const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const router = express.Router();

// Team / Admin Login
router.post('/login', async (req, res) => {
  const { team_id, password } = req.body;
  if (!team_id || !password)
    return res.status(400).json({ error: 'team_id and password required' });

  try {
    const [rows] = await pool.query('SELECT * FROM teams WHERE team_id = ?', [team_id]);
    if (!rows.length) return res.status(401).json({ error: 'Invalid credentials' });

    const team = rows[0];
    if (!team.is_active) return res.status(403).json({ error: 'Team is disabled' });

    const valid = await bcrypt.compare(password, team.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const isAdmin = team_id === 'admin';
    const token = jwt.sign(
      { id: team.id, team_id: team.team_id, team_name: team.team_name, isAdmin },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '8h' }
    );

    res.json({ token, team_id: team.team_id, team_name: team.team_name, isAdmin });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
