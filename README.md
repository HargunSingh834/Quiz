# 🎯 Quiz Event Platform

A complete real-time quiz platform for college events. Teams login from PCs in the computer lab, answer quizzes with live timers, and scores update in real-time on a leaderboard.

## Tech Stack
- **Backend**: Node.js + Express + Socket.io
- **Database**: MySQL
- **Frontend**: Vanilla HTML/CSS/JS (no build step needed)

---

## 🚀 Quick Setup

### 1. Prerequisites
- Node.js 18+
- MySQL 8.0+

### 2. Configure Database
Copy and edit the environment file:
```bash
cd backend
cp .env.example .env
```
Edit `.env` with your MySQL credentials:
```
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=quiz_event
JWT_SECRET=change_this_to_a_long_random_string
ADMIN_PASSWORD=your_admin_password
PORT=3000
```

### 3. Install & Setup
```bash
cd backend
npm install
npm run setup
```

This creates the database, all tables, the admin user, and sample data.

### 4. Start the Server
```bash
npm start
# or for development:
npm run dev
```

Server runs at: **http://localhost:3000**

---

## 📱 Access URLs

| Page | URL | Who uses it |
|------|-----|------------|
| Home | http://localhost:3000 | Everyone |
| Team Quiz | http://localhost:3000/team | Teams in computer lab |
| Admin Panel | http://localhost:3000/admin | Event organizer |
| Leaderboard | http://localhost:3000/leaderboard | Projector screen |

---

## 🎮 How to Run an Event

### Before the event:
1. Open **Admin Panel** → Teams → Create teams with IDs & passwords
2. Open **Admin Panel** → Quizzes → Create quiz rounds with questions
3. Distribute team IDs & passwords to each team

### During the event:
1. Teams open **http://your-server-ip:3000/team** on their PCs and login
2. Put **Leaderboard** on the projector: http://your-server-ip:3000/leaderboard
3. Admin opens **Event Control** tab → Click **Start** on a quiz
4. Click each question to push it to all teams simultaneously
5. Teams have the timer to answer — scores update instantly
6. Click **End Quiz** when done — final scores shown

### For multiple quiz rounds:
- Create separate quizzes (Round 1, Round 2, etc.)
- Start each round from Event Control

---

## 🔐 Default Credentials

| Role | Team ID | Password |
|------|---------|----------|
| Admin | admin | (set in .env ADMIN_PASSWORD) |
| Sample Team 1 | team_alpha | pass123 |
| Sample Team 2 | team_beta | pass123 |
| Sample Team 3 | team_gamma | pass123 |

---

## 📝 Question Types

| Type | Description |
|------|-------------|
| MCQ | 4 options (A/B/C/D) |
| True/False | Binary choice |
| Text | Free text answer (exact match) |

## 🏆 Scoring
- Points set per question (default 10)
- **Speed bonus**: +50% if answered in first 5 seconds
- Wrong answer = 0 points (no negative marking)

---

## 🌐 Network Setup for Computer Lab

All PCs in the lab should access the server by its **local IP**, not localhost.

1. Find server IP: `ipconfig` (Windows) or `ip addr` (Linux)
2. Teams use: `http://192.168.x.x:3000/team`
3. Admin uses: `http://192.168.x.x:3000/admin`
4. Leaderboard: `http://192.168.x.x:3000/leaderboard`

Make sure your firewall allows port 3000.

---

## 📁 Project Structure

```
quiz-event/
├── backend/
│   ├── config/db.js          # MySQL connection
│   ├── middleware/auth.js     # JWT auth
│   ├── routes/
│   │   ├── auth.js            # Login endpoint
│   │   ├── admin.js           # Admin CRUD
│   │   └── quiz.js            # Team quiz endpoints
│   ├── server.js              # Main server + Socket.io
│   ├── setup.js               # DB setup script
│   ├── schema.sql             # MySQL schema
│   └── .env.example
└── frontend/
    ├── index.html             # Landing page
    ├── admin/index.html       # Admin panel
    ├── team/index.html        # Team quiz interface
    └── leaderboard/index.html # Live leaderboard
```
