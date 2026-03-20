# 📚 Ecole Enfant International — School Management System

<p align="center">
  <img src="https://img.shields.io/badge/React_Native-Expo-blue?style=for-the-badge&logo=expo" />
  <img src="https://img.shields.io/badge/Database-Supabase-3ECF8E?style=for-the-badge&logo=supabase" />
  <img src="https://img.shields.io/badge/Language-TypeScript-3178C6?style=for-the-badge&logo=typescript" />
  <img src="https://img.shields.io/badge/Status-In_Progress-orange?style=for-the-badge" />
</p>

---

## 📌 Overview

A fully functional **mobile school management system** built for **Ecole Enfant International**, designed to digitise and streamline the process of recording, managing, and viewing student academic results.

The app features two separate portals — one for **teachers** to enter student data, and one for **students** to view their published results — all backed by a live **Supabase** database.

---

## ✨ Features

### 🧑‍🏫 Teacher Portal
- Secure PIN-based staff login
- View full class list with progress indicators
- Record subject scores (Class Score /40 + Exam Score /60)
- Auto-calculated totals, grades, and running average
- Rate student conduct across 6 categories (Punctuality, Participation, Neatness, Cooperation, Homework, Respect)
- Write class teacher and head teacher remarks (with quick-fill templates)
- Record attendance — days present, absent, and late arrivals
- Save all records to the database with one tap
- View all submitted/saved records at a glance

### 🎓 Student Portal
- Secure PIN-based student login
- View personal profile and result status
- Check subject-by-subject scores and grades
- View conduct report with visual progress bars
- Read class teacher and head teacher remarks
- Check attendance record and rate
- Promotion eligibility indicator

---

## 🗄️ Database Schema

Built on **Supabase (PostgreSQL)** with 7 tables:

| Table | Description |
|---|---|
| `teachers` | Staff accounts — ID, name, PIN, class, subject |
| `students` | Student profiles — ID, name, class, gender, DOB, guardian, PIN |
| `scores` | Subject scores per student per term/year |
| `conduct` | Behaviour ratings per category per term/year |
| `remarks` | Class and head teacher comments per term/year |
| `attendance` | Days present, absent, total days, late arrivals |
| `result_status` | Controls whether results are published and visible to students |

All tables are scoped by `term` and `year` so records across multiple terms are stored independently.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native (Expo) |
| Language | TypeScript |
| Database | Supabase (PostgreSQL) |
| Auth | PIN-based (teacher & student) |
| State | React Hooks (`useState`, `useEffect`, `useCallback`) |

---

## 📁 Project Structure

```
school-management-system/
├── app/                  # Main application screens
├── lib/
│   └── supabase.ts       # Supabase client configuration
├── components/           # Reusable UI components
├── constants/            # App-wide constants
├── hooks/                # Custom React hooks
├── assets/               # Images and static assets
├── screenshots/          # App screenshots
└── README.md
```

---

## ⚙️ Getting Started

### Prerequisites
- Node.js (v18 or higher)
- Expo CLI
- A Supabase account and project

### 1. Clone the repository
```bash
git clone https://github.com/nyarkod008/school-management-system.git
cd school-management-system
```

### 2. Install dependencies
```bash
npm install
```

### 3. Set up the Supabase client
Create `lib/supabase.ts`:
```ts
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = "your-supabase-project-url";
const SUPABASE_ANON = "your-supabase-anon-key";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);
```

### 4. Set up the database
- Go to your Supabase project → **SQL Editor**
- Run the database setup SQL file to create all tables and seed initial data

### 5. Start the app
```bash
npx expo start
```

---

## 🔐 Demo Accounts

### Teacher Portal
| Staff ID | PIN | Class |
|---|---|---|
| TCH-001 | 1234 | PRIMARY 6A |
| TCH-002 | 2222 | JHS 2B |

### Student Portal
| Student ID | PIN |
|---|---|
| STU-001 | 0001 |
| STU-002 | 0002 |
| STU-006 | 0006 |
| STU-007 | 0007 |

---

## 📊 Grading System

| Grade | Range | Remark |
|---|---|---|
| A | 80 – 100 | Excellent |
| B | 70 – 79 | Very Good |
| C | 60 – 69 | Good |
| D | 50 – 59 | Average |
| F | 0 – 49 | Fail |

Scores are split into **Class Score (max 40)** and **Exam Score (max 60)**, totalling 100.

---

## 🔄 How It Works

```
Teacher logs in
      ↓
Selects a student from the class list
      ↓
Enters scores, conduct, remarks, attendance
      ↓
Saves record to Supabase database
      ↓
Student logs in and views published results
```

Results are only visible to students **after** the teacher saves them — controlled by the `result_status` table.

---

## 🚀 Future Improvements

- [ ] Admin dashboard for school-wide analytics
- [ ] PDF report card generation and download
- [ ] Push notifications when results are published
- [ ] Multi-term result history and comparison
- [ ] Class position and ranking system
- [ ] Parent portal for guardians to monitor their ward

---

## 💡 What I Learned

- Building a full-stack mobile application with React Native and Expo
- Integrating a live PostgreSQL database using Supabase
- Designing role-based interfaces (teacher vs student)
- Managing complex app state across multiple screens with React Hooks
- Structuring real-world data with relational database tables
- Handling live data upserts, batch queries, and row-level security

---

## 👨‍💻 Author

**Daniel Nyarko**

Open to internship, freelance, and collaboration opportunities.

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).
