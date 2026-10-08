const express = require('express');
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const router = express.Router();

// Get active session
router.get('/active-session', authMiddleware, async (req, res) => {
  const [sessions] = await pool.query(
    `SELECT qs.*, q.title, q.description FROM quiz_sessions qs
     JOIN quizzes q ON q.id = qs.quiz_id
     WHERE qs.status IN ('waiting','question_active','question_ended')
     ORDER BY qs.id DESC LIMIT 1`
  );
  if (!sessions.length) return res.json({ session: null });
  res.json({ session: sessions[0] });
});

// Get current question for active session
router.get('/session/:session_id/current-question', authMiddleware, async (req, res) => {
  const [sessions] = await pool.query('SELECT * FROM quiz_sessions WHERE id=?', [req.params.session_id]);
  if (!sessions.length) return res.status(404).json({ error: 'Session not found' });
  const session = sessions[0];

  if (!session.current_question_id) return res.json({ question: null, session });

  const [questions] = await pool.query(
    'SELECT id, question_text, option_a, option_b, option_c, option_d, question_type, points, time_limit, order_index FROM questions WHERE id=?',
    [session.current_question_id]
  );
  if (!questions.length) return res.json({ question: null, session });

  // Check if team already answered
  const teamId = req.user.id;
  const [existing] = await pool.query(
    'SELECT * FROM answers WHERE team_id=? AND question_id=? AND quiz_session_id=?',
    [teamId, session.current_question_id, session.id]
  );

  const elapsed = session.question_start_time
    ? Math.floor((Date.now() - new Date(session.question_start_time).getTime()) / 1000)
    : 0;

  res.json({
    question: questions[0],
    session,
    already_answered: existing.length > 0,
    elapsed_seconds: elapsed
  });
});

// Submit answer
router.post('/session/:session_id/answer', authMiddleware, async (req, res) => {
  const { question_id, answer } = req.body;
  const teamId = req.user.id;
  const sessionId = req.params.session_id;

  try {
    const [sessions] = await pool.query('SELECT * FROM quiz_sessions WHERE id=? AND status="question_active"', [sessionId]);
    if (!sessions.length) return res.status(400).json({ error: 'No active question' });
    const session = sessions[0];

    if (session.current_question_id != question_id)
      return res.status(400).json({ error: 'This question is no longer active' });

    // Check not already answered
    const [existing] = await pool.query(
      'SELECT id FROM answers WHERE team_id=? AND question_id=? AND quiz_session_id=?',
      [teamId, question_id, sessionId]
    );
    if (existing.length) return res.status(409).json({ error: 'Already answered' });

    const [questions] = await pool.query('SELECT * FROM questions WHERE id=?', [question_id]);
    if (!questions.length) return res.status(404).json({ error: 'Question not found' });
    const q = questions[0];

    // Check correctness
    let isCorrect = false;
    if (q.question_type === 'text') {
      isCorrect = answer.trim().toLowerCase() === (q.correct_text || '').trim().toLowerCase();
    } else {
      isCorrect = answer.toUpperCase() === q.correct_answer.toUpperCase();
    }

    const timeTaken = session.question_start_time
      ? Math.floor((Date.now() - new Date(session.question_start_time).getTime()) / 1000)
      : 0;

    // Bonus points for speed (up to 50% bonus for answering in first 5 seconds)
    let points = isCorrect ? q.points : 0;
    if (isCorrect && timeTaken < 5) points = Math.floor(points * 1.5);

    await pool.query(
      'INSERT INTO answers (team_id, question_id, quiz_session_id, answer_given, is_correct, points_awarded, time_taken) VALUES (?,?,?,?,?,?,?)',
      [teamId, question_id, sessionId, answer, isCorrect, points, timeTaken]
    );

    res.json({ success: true, is_correct: isCorrect, points_awarded: points });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Already answered' });
    res.status(500).json({ error: err.message });
  }
});

// Get leaderboard for a session
router.get('/session/:session_id/leaderboard', authMiddleware, async (req, res) => {
  const [rows] = await pool.query(`
    SELECT t.team_name, t.team_id,
      COALESCE(SUM(a.points_awarded), 0) as total_score,
      COUNT(a.id) as answered,
      COALESCE(SUM(a.is_correct), 0) as correct
    FROM teams t
    LEFT JOIN answers a ON a.team_id = t.id AND a.quiz_session_id = ?
    WHERE t.is_active = TRUE AND t.team_id != 'admin'
    GROUP BY t.id
    ORDER BY total_score DESC
  `, [req.params.session_id]);
  res.json(rows);
});

module.exports = router;
