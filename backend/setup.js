require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');

async function setup() {
  console.log('🔧 Setting up Quiz Event database...\n');

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  // Create DB
  await conn.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME || 'quiz_event'}`);
  await conn.query(`USE ${process.env.DB_NAME || 'quiz_event'}`);
  console.log('✅ Database created');

  // Run schema
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  // Run line by line to avoid multi-statement issues
  const statements = schema.split(';').map(s => s.trim()).filter(s => s && !s.startsWith('--'));
  for (const stmt of statements) {
    try { await conn.query(stmt); } catch(e) { /* ignore IF EXISTS errors */ }
  }
  console.log('✅ Tables created');

  // Create admin
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = await bcrypt.hash(adminPass, 10);
  try {
    await conn.query(
      'INSERT INTO teams (team_id, password_hash, team_name) VALUES (?,?,?) ON DUPLICATE KEY UPDATE password_hash=?',
      ['admin', hash, 'Administrator', hash]
    );
    console.log(`✅ Admin user created — login: admin / ${adminPass}`);
  } catch(e) { console.log('Admin already exists'); }

  // Sample data
  try {
    const [existing] = await conn.query('SELECT id FROM quizzes LIMIT 1');
    if (!existing.length) {
      const [q] = await conn.query('INSERT INTO quizzes (title, description) VALUES (?,?)',
        ['Sample Quiz - Round 1', 'General knowledge warm-up round']);
      await conn.query(`INSERT INTO questions (quiz_id,question_text,option_a,option_b,option_c,option_d,correct_answer,question_type,points,time_limit,order_index) VALUES
        (${q.insertId},'What does CPU stand for?','Central Processing Unit','Computer Personal Unit','Central Program Utility','Core Processing Unit','A','mcq',10,30,1),
        (${q.insertId},'HTML stands for HyperText Markup Language',NULL,NULL,NULL,NULL,'A','truefalse',5,15,2),
        (${q.insertId},'What is 2 + 2 × 2?','4','6','8','10','B','mcq',10,20,3),
        (${q.insertId},'What programming language is known as the language of the web?',NULL,NULL,NULL,NULL,'TEXT','text',15,30,4)`);
      await conn.query('UPDATE questions SET correct_text="JavaScript" WHERE question_type="text" AND quiz_id=?', [q.insertId]);
      console.log('✅ Sample quiz created');

      // Sample teams
      const teams = [['team_alpha','pass123','Team Alpha'],['team_beta','pass123','Team Beta'],['team_gamma','pass123','Team Gamma']];
      for (const [tid, pass, name] of teams) {
        const h = await bcrypt.hash(pass, 10);
        await conn.query('INSERT IGNORE INTO teams (team_id,password_hash,team_name) VALUES (?,?,?)', [tid, h, name]);
      }
      console.log('✅ Sample teams created (team_alpha/beta/gamma — password: pass123)');
    }
  } catch(e) { console.error('Sample data error:', e.message); }

  await conn.end();
  console.log('\n🎉 Setup complete! Run: npm start');
}

setup().catch(err => { console.error('Setup failed:', err); process.exit(1); });
