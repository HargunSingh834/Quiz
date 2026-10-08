require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { pool, testConnection } = require('./config/db');
const jwt = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/quiz', require('./routes/quiz'));

// ── Socket.io ──────────────────────────────────────────

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    // Allow unauthenticated for leaderboard display screens
    socket.user = { team_id: 'viewer', isAdmin: false, isViewer: true };
    return next();
  }
  try {
    socket.user = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    next();
  } catch { next(new Error('Invalid token')); }
});

io.on('connection', (socket) => {
  console.log(`🔌 Connected: ${socket.user.team_id}`);

  socket.on('join_session', (sessionId) => {
    socket.join(`session_${sessionId}`);
    if (socket.user.isAdmin) socket.join(`admin_${sessionId}`);
  });

  // ── Admin events ──

  socket.on('admin_start_quiz', async ({ quiz_id }) => {
    if (!socket.user.isAdmin) return;
    try {
      const [existing] = await pool.query(
        'SELECT id FROM quiz_sessions WHERE quiz_id=? AND status NOT IN ("finished")',
        [quiz_id]
      );
      let sessionId;
      if (existing.length) {
        sessionId = existing[0].id;
        await pool.query('UPDATE quiz_sessions SET status="waiting", started_at=NOW() WHERE id=?', [sessionId]);
      } else {
        const [r] = await pool.query(
          'INSERT INTO quiz_sessions (quiz_id, status, started_at) VALUES (?,?,NOW())',
          [quiz_id, 'waiting']
        );
        sessionId = r.insertId;
      }
      await pool.query('UPDATE quizzes SET status="active" WHERE id=?', [quiz_id]);

      const [quiz] = await pool.query('SELECT * FROM quizzes WHERE id=?', [quiz_id]);
      io.emit('quiz_started', { session_id: sessionId, quiz: quiz[0] });
      socket.emit('session_created', { session_id: sessionId });
    } catch (err) { socket.emit('error', err.message); }
  });

  socket.on('admin_next_question', async ({ session_id, question_id }) => {
    if (!socket.user.isAdmin) return;
    try {
      await pool.query(
        'UPDATE quiz_sessions SET current_question_id=?, question_start_time=NOW(), status="question_active" WHERE id=?',
        [question_id, session_id]
      );
      const [questions] = await pool.query(
        'SELECT id, question_text, option_a, option_b, option_c, option_d, question_type, points, time_limit, order_index FROM questions WHERE id=?',
        [question_id]
      );
      const q = questions[0];
      io.to(`session_${session_id}`).emit('question_started', {
        question: q,
        session_id,
        start_time: Date.now()
      });

      // Auto-end after time_limit
      setTimeout(async () => {
        const [s] = await pool.query('SELECT * FROM quiz_sessions WHERE id=? AND current_question_id=?', [session_id, question_id]);
        if (s.length && s[0].status === 'question_active') {
          await pool.query('UPDATE quiz_sessions SET status="question_ended" WHERE id=?', [session_id]);
          const [correct] = await pool.query('SELECT correct_answer, correct_text FROM questions WHERE id=?', [question_id]);
          io.to(`session_${session_id}`).emit('question_ended', {
            question_id,
            correct_answer: correct[0]?.correct_answer,
            correct_text: correct[0]?.correct_text
          });
          broadcastLeaderboard(session_id);
        }
      }, (q.time_limit + 2) * 1000);

    } catch (err) { socket.emit('error', err.message); }
  });

  socket.on('admin_end_question', async ({ session_id, question_id }) => {
    if (!socket.user.isAdmin) return;
    await pool.query('UPDATE quiz_sessions SET status="question_ended" WHERE id=?', [session_id]);
    const [correct] = await pool.query('SELECT correct_answer, correct_text FROM questions WHERE id=?', [question_id]);
    io.to(`session_${session_id}`).emit('question_ended', {
      question_id,
      correct_answer: correct[0]?.correct_answer,
      correct_text: correct[0]?.correct_text
    });
    broadcastLeaderboard(session_id);
  });

  socket.on('admin_end_quiz', async ({ session_id, quiz_id }) => {
    if (!socket.user.isAdmin) return;
    await pool.query('UPDATE quiz_sessions SET status="finished", ended_at=NOW() WHERE id=?', [session_id]);
    await pool.query('UPDATE quizzes SET status="ended" WHERE id=?', [quiz_id]);
    broadcastLeaderboard(session_id);
    io.to(`session_${session_id}`).emit('quiz_ended', { session_id });
  });

  socket.on('admin_pause', async ({ session_id }) => {
    if (!socket.user.isAdmin) return;
    await pool.query('UPDATE quiz_sessions SET status="question_ended" WHERE id=?', [session_id]);
    io.to(`session_${session_id}`).emit('quiz_paused');
  });

  // ── Team events ──

  socket.on('answer_submitted', async ({ session_id }) => {
    broadcastLeaderboard(session_id);
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Disconnected: ${socket.user.team_id}`);
  });
});

async function broadcastLeaderboard(sessionId) {
  try {
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
    `, [sessionId]);
    io.to(`session_${sessionId}`).emit('leaderboard_update', rows);
  } catch (err) { console.error('Leaderboard error:', err); }
}

// HTML routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../frontend/index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin/index.html')));
app.get('/team', (req, res) => res.sendFile(path.join(__dirname, '../frontend/team/index.html')));
app.get('/leaderboard', (req, res) => res.sendFile(path.join(__dirname, '../frontend/leaderboard/index.html')));

const PORT = process.env.PORT || 3000;

testConnection().then(() => {
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`   Admin panel: http://localhost:${PORT}/admin`);
    console.log(`   Team login:  http://localhost:${PORT}/team`);
    console.log(`   Leaderboard: http://localhost:${PORT}/leaderboard`);
  });
});
