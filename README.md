# 🗳️ DVS - Digital Voting System (DVT1)

Welcome to the **Digital Voting System (DVS)**, a production-grade, secure, and transparent digital voting platform designed for high availability and ease of use. This project, codenamed **DVT1**, is built using a microservices architecture to ensure scalability, reliability, and security.

This document serves as a comprehensive guide for developers, administrators, and stakeholders to understand the app's purpose, architecture, and inner workings.

---

## 🌟 Project Overview

DVS is designed to digitize the voting process while maintaining the highest standards of security and transparency. It features:
- **Multi-Role Dashboards**: Specific interfaces for Voters, Polling Officers, Admins, and Super Admins.
- **Microservices Architecture**: Decoupled services for authentication, voting data, and API management.
- **Bilingual Support**: Full support for English and Hindi (i18next).
- **Beta Tester (Guest) Flow**: A unique system for temporary demo access with automatic email notifications.
- **Adaptive Resilience**: Built-in mechanisms to handle "cold starts" on free-tier infrastructure (like Render/Neon).

---

## 🏗️ System Architecture

The application is split into a **Frontend (React)** and three **Backend Microservices (Node.js/Express)**.

### 1. High-Level Flow
1.  **Frontend**: Communicates with the `API Gateway`.
2.  **API Gateway**: Acts as a central entry point and routes requests to the appropriate service.
3.  **Voter Auth Service**: Manages users (voters, officers, admins), sessions, and machine status.
4.  **Election Data Service**: Manages states, constituencies, candidates, parties, and the actual voting logic.

### 2. Service Map
| Service | Purpose | Port (Local) |
| :--- | :--- | :--- |
| **Frontend** | User Interface (React + Vite) | 5173 |
| **API Gateway** | Routing & Proxying | 8000 |
| **Voter Auth Service** | Identity & Session Management | 8001 |
| **Election Data Service** | Election Master Data & Votes | 8002 |

---

## 📂 File Directory Map

Here is a guide to where the most important code lives:

### 🏠 Root Directory
- `render.yaml`: The "Master Plan" for deployment on Render.
- `README.md`: This document.
- `deploy.ps1`: A script to help with deployment tasks.

### 🌐 Frontend (`/frontend/src`)
- `App.jsx`: Main logic for routing and session monitoring.
- `main.jsx`: The entry point for the React app.
- `i18n.js`: Contains all the text translations (English & Hindi).
- `index.css`: The "Design System" (colors, fonts, layout styles).
- **`/components`**:
  - `AuthSelector.jsx`: The role selection and login screen.
  - `VoterFlow.jsx`: The voting experience.
  - `ManagementFlow.jsx`: The Admin/SuperAdmin/Officer dashboards.
  - `GuestRegistration.jsx`: The beta tester sign-up form.

### ⚙️ Services (`/services`)
- **`api-gateway/index.js`**: The traffic controller.
- **`voter-auth-service/index.js`**: Logic for users, PINs, and machine status.
- **`election-data-service/index.js`**: Logic for candidates, parties, and recording votes.

---

## 🛠️ Service Breakdown

### 📂 `services/api-gateway`
- **Purpose**: The "Front Door" of the backend. It ensures the frontend only needs to talk to one URL.
- **Key Functionality**:
  - Proxies `/api/verification` requests to the **Voter Auth Service**.
  - Proxies `/api/voting` requests to the **Election Data Service**.
  - Provides a `/health` endpoint for monitoring.

### 📂 `services/voter-auth-service`
- **Purpose**: Handles "Who are you?" and "Is the machine ready?".
- **Key Functionality**:
  - **Database Management**: Manages tables for `voters`, `admins`, `polling_officers`, and `sessions`.
  - **Authentication**: Uses JWT (JSON Web Tokens) for secure, stateless logins.
  - **Guest Access**: Generates 15-minute temporary PINs for beta testers and sends them via Email (Nodemailer).
  - **Machine Control**: Tracks if a specific constituency is "Active" and if the "Ballot is Enabled" for the next voter.
  - **Rate Limiting**: Protects against brute-force attacks on PINs.

### 📂 `services/election-data-service`
- **Purpose**: Handles "Who can I vote for?" and "Record my vote."
- **Key Functionality**:
  - **Master Data**: Manages states, constituencies, parties, and candidates (with images and Hindi names).
  - **Voting Logic**: Securely records votes in the `votes` table using an **anonymous ballot box** strategy. It ensures a voter cannot vote twice by tracking participation separately from the ballot itself.
  - **Analytics**: Calculates real-time stats (Total Votes, Votes per Party).
  - **History management**: Allows Super Admins to "Reset" or "Restore" voting cycles (archiving current votes into `votes_history`).

---

## 🖥️ Frontend Breakdown (`/frontend`)

Built with **React**, **Vite**, and **Vanilla CSS**.

### 1. Key Components
- **`App.jsx`**: The orchestrator. Handles language switching, backend "wake-up" logic, and global session management.
- **`AuthSelector.jsx`**: The gateway where users choose their role or register as a guest.
- **`VoterFlow.jsx`**: The step-by-step voting process (PIN entry -> Candidate Selection -> VVPAT Animation -> Success).
- **`ManagementFlow.jsx`**: A multi-functional dashboard that adapts its UI based on the logged-in role (Admin, Super Admin, or Officer).
- **`GuestRegistration.jsx`**: A premium form for beta testers to request demo access.

### 2. User Roles & Capabilities
- **Voter**: Enters PIN (Acknowledge Number), views candidates, and casts a vote.
- **Polling Officer**:
  - **Power On/Off**: Activates the machine for their specific constituency.
  - **Enable Ballot**: A physical-style trigger that allows the next voter in line to login.
- **Admin**: Monitors machine health and connectivity status across areas.
- **Super Admin**:
  - **Live Results**: Views real-time vote counts and charts.
  - **System Control**: Can reset stats or restore previous voting cycles.

---

## 🗄️ Database Schema (PostgreSQL)

The system uses two logical separations (often in the same DB instance but different tables):

### Auth Tables
- `voters`: `id`, `name`, `constituency_id`.
- `admins`: `username`, `pin` (hashed).
- `polling_officers`: `username`, `pin` (hashed), `constituency_id`.
- `constituency_status`: Tracks `is_active` and `ballot_enabled`.
- `ack_numbers`: Temporary numbers generated for voters to login.

### Election Tables
- `states` / `constituencies`: Geographic hierarchy.
- `parties` / `candidates`: The "Who's Who" of the election.
- `voter_participation`: Records *who* has voted (prevents double-voting).
- `votes`: The **Anonymized Ballot Box** (stores only Party/Candidate selection).
- `votes_history` / `voter_participation_history`: Archived records from previous resets.

---

## 🚀 Key Features to Know

### 📧 Guest Beta Tester System
To allow non-technical users to test the app without manual setup:
1. User enters name/email in the frontend.
2. Backend generates three 4-digit PINs (Admin, SuperAdmin, Officer).
3. These are valid for **exactly 15 minutes**.
4. The user receives a beautiful HTML email with their credentials.
5. The frontend shows a live countdown timer; once it hits zero, the user is automatically logged out and notified via email.

### 🛡️ Voter Secrecy & Anonymization
To ensure the "Secrecy of the Ballot," the system uses a decoupled storage architecture:
- **The Registry**: When a voter casts their ballot, their ID is recorded in a "Participation Registry." This tells the system they have already voted.
- **The Ballot Box**: The actual vote is dropped into a separate "Anonymous Ballot Box" with **no connection** to the voter's identity or session.
- **Data Cleansing**: The system includes a migration engine that automatically anonymizes any existing identifiable data, ensuring even old test records are secure.

### ❄️ Cold Start Handling
Because this app is often hosted on "Free Tier" services (like Render), the servers "go to sleep" after inactivity.
- **The "Waking up" Screen**: When you first open the app, it checks if the backend is awake. If not, it shows an engaging screen with voting facts while the servers boot up.
- **Keep-Alive**: The `health` endpoints are designed to be pinged by external cron jobs (like cron-job.org) to keep the database and services awake during active hours.

---

## 🔍 Troubleshooting Guide

| Issue | Likely Cause | Solution |
| :--- | :--- | :--- |
| **"Backend Not Responding"** | Servers are sleeping or `render.yaml` config is wrong. | Wait 60 seconds for cold start or check Render dashboard logs. |
| **"Invalid PIN"** | Session expired or wrong role selected. | Check if the Guest timer has hit zero. Try requesting a new PIN. |
| **"Voter cannot login"** | Polling Officer has not "Enabled Ballot". | Login as Polling Officer for that area and click "Enable Ballot". |
| **Email not sending** | `SMTP_PASS` environment variable is missing. | Update the environment variables in the `voter-auth-service` settings. |
| **DB Connection Error** | `DATABASE_URL` is incorrect or Neon DB is suspended. | Check connection string and ensure DB is active. |

---

## 📦 Deployment

The app is optimized for **Render.com**.
- **Blueprint**: The `render.yaml` file defines the entire environment.
- **Database**: Uses **Neon PostgreSQL**.
- **Frontend**: Can be deployed to Vercel or Render Static Sites.

---

## 👨‍💻 Developer Notes
- **Styling**: Uses CSS Variables (tokens) in `index.css` for easy theme changes.
- **Security**: PINs are hashed using `bcrypt`, and sessions use `jsonwebtoken`.
- **Concurrency**: Services use connection pooling (`pg.Pool`) to handle multiple simultaneous voters efficiently.

---
*This documentation was automatically generated and refined to help non-developers understand the DVT1 ecosystem.*
