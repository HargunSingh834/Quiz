const express = require('express');
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');
const { adminMiddleware } = require('../middleware/auth');
const router = express.Router();

// ── Teams ──────────────────────────────────────────────

router.get('/teams', adminMiddleware, async (req, res) => {
  const [rows] = await pool.query('SELECT id, team_id, team_name, is_active, created_at FROM teams WHERE team_id != "admin"');
  res.json(rows);
});

router.post('/teams', adminMiddleware, async (req, res) => {
  const { team_id, password, team_name } = req.body;
  if (!team_id || !password || !team_name)
    return res.status(400).json({ error: 'team_id, password and team_name required' });
  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query('INSERT INTO teams (team_id, password_hash, team_name) VALUES (?,?,?)', [team_id, hash, team_name]);
    res.json({ success: true });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Team ID already exists' });
    res.status(500).json({ error: err.message });
  }
});

router.patch('/teams/:id', adminMiddleware, async (req, res) => {
  const { is_active, password, team_name } = req.body;
  const updates = [];
  const vals = [];
  if (is_active !== undefined) { updates.push('is_active=?'); vals.push(is_active); }
  if (team_name) { updates.push('team_name=?'); vals.push(team_name); }
  if (password) { updates.push('password_hash=?'); vals.push(await bcrypt.hash(password, 10)); }
  if (!updates.length) return res.status(400).json({ error: 'Nothing to update' });
  vals.push(req.params.id);
  await pool.query(`UPDATE teams SET ${updates.join(',')} WHERE id=?`, vals);
  res.json({ success: true });
});

router.delete('/teams/:id', adminMiddleware, async (req, res) => {
  await pool.query('DELETE FROM teams WHERE id=? AND team_id != "admin"', [req.params.id]);
  res.json({ success: true });
});

// ── Quizzes ────────────────────────────────────────────

router.get('/quizzes', adminMiddleware, async (req, res) => {
  const [quizzes] = await pool.query('SELECT * FROM quizzes ORDER BY created_at DESC');
  res.json(quizzes);
});

router.post('/quizzes', adminMiddleware, async (req, res) => {
  const { title, description } = req.body;
  if (!title) return res.status(400).json({ error: 'title required' });
  const [r] = await pool.query('INSERT INTO quizzes (title,description) VALUES (?,?)', [title, description || '']);
  res.json({ id: r.insertId, success: true });
});

router.patch('/quizzes/:id', adminMiddleware, async (req, res) => {
  const { title, description } = req.body;
  await pool.query('UPDATE quizzes SET title=?,description=? WHERE id=?', [title, description, req.params.id]);
  res.json({ success: true });
});

router.delete('/quizzes/:id', adminMiddleware, async (req, res) => {
  await pool.query('DELETE FROM quizzes WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ── Questions ──────────────────────────────────────────

router.get('/quizzes/:id/questions', adminMiddleware, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM questions WHERE quiz_id=? ORDER BY order_index', [req.params.id]);
  res.json(rows);
});

router.post('/quizzes/:id/questions', adminMiddleware, async (req, res) => {
  const { question_text, option_a, option_b, option_c, option_d, correct_answer, correct_text, question_type, points, time_limit, order_index } = req.body;
  if (!question_text || !correct_answer) return res.status(400).json({ error: 'question_text and correct_answer required' });
  const [r] = await pool.query(
    'INSERT INTO questions (quiz_id,question_text,option_a,option_b,option_c,option_d,correct_answer,correct_text,question_type,points,time_limit,order_index) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    [req.params.id, question_text, option_a, option_b, option_c, option_d, correct_answer, correct_text, question_type || 'mcq', points || 10, time_limit || 30, order_index || 0]
  );
  res.json({ id: r.insertId, success: true });
});

router.put('/questions/:id', adminMiddleware, async (req, res) => {
  const { question_text, option_a, option_b, option_c, option_d, correct_answer, correct_text, question_type, points, time_limit, order_index } = req.body;
  await pool.query(
    'UPDATE questions SET question_text=?,option_a=?,option_b=?,option_c=?,option_d=?,correct_answer=?,correct_text=?,question_type=?,points=?,time_limit=?,order_index=? WHERE id=?',
    [question_text, option_a, option_b, option_c, option_d, correct_answer, correct_text, question_type, points, time_limit, order_index, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/questions/:id', adminMiddleware, async (req, res) => {
  await pool.query('DELETE FROM questions WHERE id=?', [req.params.id]);
  res.json({ success: true });
});

// ── Sessions ───────────────────────────────────────────

router.get('/sessions', adminMiddleware, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT qs.*, q.title as quiz_title, q.description as quiz_description
    FROM quiz_sessions qs
    JOIN quizzes q ON q.id = qs.quiz_id
    ORDER BY qs.id DESC
  `);
  res.json(rows);
});

// ── Results ────────────────────────────────────────────

router.get('/results/:session_id', adminMiddleware, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT t.team_name, t.team_id,
      COALESCE(SUM(a.points_awarded), 0) as total_score,
      COUNT(a.id) as answered,
      COALESCE(SUM(a.is_correct), 0) as correct
    FROM teams t
    LEFT JOIN answers a ON a.team_id = t.id AND a.quiz_session_id = ?
    WHERE t.team_id != 'admin' AND t.is_active = TRUE
    GROUP BY t.id
    ORDER BY total_score DESC
  `, [req.params.session_id]);
  res.json(rows);
});

// Per-question breakdown for a session
router.get('/results/:session_id/breakdown', adminMiddleware, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT
      q.id as question_id,
      q.question_text,
      q.correct_answer,
      q.correct_text,
      q.points,
      q.order_index,
      COUNT(a.id) as total_answers,
      COALESCE(SUM(a.is_correct), 0) as correct_count,
      ROUND(AVG(a.time_taken), 1) as avg_time
    FROM questions q
    JOIN quiz_sessions qs ON qs.quiz_id = q.quiz_id
    LEFT JOIN answers a ON a.question_id = q.id AND a.quiz_session_id = ?
    WHERE qs.id = ?
    GROUP BY q.id
    ORDER BY q.order_index
  `, [req.params.session_id, req.params.session_id]);
  res.json(rows);
});

// Bulk create teams
router.post('/teams/bulk', adminMiddleware, async (req, res) => {
  const { teams } = req.body; // [{ team_id, team_name, password }]
  if (!Array.isArray(teams) || !teams.length)
    return res.status(400).json({ error: 'teams array required' });

  const results = [];
  for (const t of teams) {
    try {
      const hash = await bcrypt.hash(t.password, 10);
      await pool.query('INSERT INTO teams (team_id, password_hash, team_name) VALUES (?,?,?)',
        [t.team_id, hash, t.team_name]);
      results.push({ team_id: t.team_id, success: true });
    } catch (err) {
      results.push({ team_id: t.team_id, success: false, error: err.code === 'ER_DUP_ENTRY' ? 'Already exists' : err.message });
    }
  }
  res.json(results);
});

module.exports = router;
