-- Quiz Event Platform - MySQL Schema
CREATE DATABASE IF NOT EXISTS quiz_event;
USE quiz_event;

CREATE TABLE IF NOT EXISTS teams (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  team_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS quizzes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  status ENUM('pending','active','paused','ended') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT NOT NULL,
  question_text TEXT NOT NULL,
  option_a VARCHAR(300),
  option_b VARCHAR(300),
  option_c VARCHAR(300),
  option_d VARCHAR(300),
  correct_answer ENUM('A','B','C','D','TEXT') NOT NULL,
  correct_text VARCHAR(300),
  question_type ENUM('mcq','truefalse','text') DEFAULT 'mcq',
  points INT DEFAULT 10,
  time_limit INT DEFAULT 30,
  order_index INT DEFAULT 0,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  quiz_id INT NOT NULL,
  current_question_id INT,
  question_start_time TIMESTAMP NULL,
  status ENUM('waiting','question_active','question_ended','finished') DEFAULT 'waiting',
  started_at TIMESTAMP NULL,
  ended_at TIMESTAMP NULL,
  FOREIGN KEY (quiz_id) REFERENCES quizzes(id)
);

CREATE TABLE IF NOT EXISTS answers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  question_id INT NOT NULL,
  quiz_session_id INT NOT NULL,
  answer_given VARCHAR(300),
  is_correct BOOLEAN DEFAULT FALSE,
  points_awarded INT DEFAULT 0,
  time_taken INT,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_answer (team_id, question_id, quiz_session_id),
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (question_id) REFERENCES questions(id),
  FOREIGN KEY (quiz_session_id) REFERENCES quiz_sessions(id)
);

CREATE TABLE IF NOT EXISTS team_sessions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  team_id INT NOT NULL,
  token VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- Default admin credentials (change in production!)
-- admin / admin123
INSERT IGNORE INTO teams (team_id, password_hash, team_name, is_active)
VALUES ('admin', '$2b$10$rOzJqhJkHsGzKkJkJkJkJeQwQwQwQwQwQwQwQwQwQwQwQwQwQwQw', 'Administrator', TRUE);
