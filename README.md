# 🛡️ SafeHer
### AI-Powered Women's Safety Platform

SafeHer is an AI-powered women safety platform that helps users stay protected during travel and emergency situations.

The application combines **real-time location tracking**, **voice-based SOS activation**, **trusted guardian notifications**, **safe travel monitoring**, and **AI-powered risk detection** into a single mobile platform.

The project is being developed for innovation competitions including the **Samsung Solve for Tomorrow Challenge**, with the objective of making emergency assistance faster, smarter, and more accessible.

---

# 🚀 Features

## ✅ Current Features (V1)

### 👤 User Profile
- User registration
- Login
- Profile management
- Persistent profile storage using Supabase

---

### 📍 Safe Window

Users can create a Safe Window before starting a journey.

The feature includes:

- Start location
- Destination
- Expected arrival time
- Journey monitoring
- Automatic timeout detection

If the user fails to reach the destination within the expected time, SafeHer begins emergency verification.

---

### 👨‍👩‍👧 Guardian Management

Users can securely store trusted contacts.

Features:

- Add guardian
- Edit guardian
- Delete guardian
- Store guardian information in Supabase

---

### 🚨 Emergency SOS

Emergency alert system capable of:

- Voice activation
- Manual SOS button
- Real-time location sharing
- Guardian notification

---

### 📡 Live Location Sharing

During an emergency the app shares:

- Current GPS location
- Journey status
- Timestamp
- Live tracking information

---

### ☁️ Cloud Backend

Backend APIs built using:

- FastAPI
- PostgreSQL (Supabase)
- REST APIs

Responsible for:

- Authentication
- Journey management
- Guardian management
- Profile synchronization

---

## 🚧 Planned Features (V2)

### 🤖 AI Emergency Detection

- Voice stress detection
- Distress keyword detection
- Abnormal movement detection
- Silent emergency prediction

---

### 🧠 NLP Module

Natural Language Processing for:

- Voice command recognition
- Emergency intent detection
- Context understanding

Examples:

> "Help me"

> "Someone is following me"

> "I'm not safe"

---

### 📈 Risk Prediction

Machine Learning models for:

- Unsafe route prediction
- High-risk area detection
- Time-based safety scoring

---

### 🔔 Smart Notifications

- Escalating alerts
- Guardian acknowledgement
- Emergency reminders

---

### 📍 Route Intelligence

- Suggested safer routes
- Route risk comparison
- Travel recommendations

---

## 🚀 Planned Features (V3)

### 📡 IoT Safety Device

A wearable emergency device including:

- Dedicated SOS button
- Long battery life
- GSM communication
- GPS module
- Independent emergency communication

This enables emergency assistance even when the user cannot access their mobile phone.

---

### 🛰 Offline Emergency Communication

Support for:

- GSM
- SMS fallback
- Low-network emergency alerts

---

### 🎙 AI Voice Assistant

Hands-free emergency assistance.

Example:

```
User:
Help!

AI:
Emergency detected.
Sending your location to guardians.
```

---

### 📊 Emergency Dashboard

Authorities and guardians can monitor:

- Live alerts
- Journey status
- User locations
- Emergency history

---

# 🏗 System Architecture

```
                 Mobile App
                      │
                      │
         Voice / GPS / SOS Events
                      │
                      ▼
              FastAPI Backend
                      │
      ┌───────────────┴───────────────┐
      │                               │
 Supabase Database              AI Services
      │                               │
 Guardian Data            Risk Prediction
 Journey Data             Voice Analysis
 User Profiles            NLP Models
```

---

# 🛠 Technology Stack

## Mobile

- React Native
- Expo
- TypeScript

---

## Backend

- FastAPI
- Python
- REST APIs

---

## Database

- Supabase
- PostgreSQL

---

## AI & ML (Planned)

- TensorFlow
- Scikit-learn
- OpenAI APIs
- Whisper
- NLP Models

---

## Maps

- GPS
- Geolocation API

---

# 📂 Project Structure

```
women-safety-voice-sos
│
├── backend/
│     FastAPI backend
│
├── mobile/
│     React Native application
│
├── dashboard/
│     Admin dashboard
│
├── docs/
│     Documentation
│
├── mobile_sdk56_backup/
│     Backup project
│
└── README.md
```

---

# ⚙️ Installation

## Clone Repository

```bash
git clone https://github.com/<your-username>/women-safety-voice-sos.git
```

```
cd women-safety-voice-sos
```

---

## Backend Setup

```
cd backend
```

Create virtual environment

```
python -m venv venv
```

Activate

Windows

```
venv\Scripts\activate
```

Linux/Mac

```
source venv/bin/activate
```

Install dependencies

```
pip install -r requirements.txt
```

Run server

```
uvicorn app.main:app --reload
```

Backend runs on

```
http://127.0.0.1:8000
```

---

## Mobile Setup

```
cd mobile
```

Install packages

```
npm install
```

Run Expo

```
npx expo start
```

or

```
npm start
```

---

# 🗄 Environment Variables

Backend

```
SUPABASE_URL=
SUPABASE_KEY=
DATABASE_URL=
```

Mobile

```
EXPO_PUBLIC_API_URL=
```

---

# 📡 API Modules

Current API endpoints include:

- Authentication
- User Profile
- Guardian Management
- Safe Window
- Journey Monitoring
- SOS
- Notifications

---

# 📊 Development Roadmap

| Version | Status |
|----------|--------|
| V1 Core Mobile App | ✅ Completed |
| Backend Integration | ✅ Completed |
| Supabase Integration | ✅ Completed |
| Guardian Management | ✅ Completed |
| Safe Window | ✅ Completed |
| Voice SOS | 🚧 In Progress |
| AI Detection | 🚧 Planned |
| ML Risk Prediction | 🚧 Planned |
| NLP Module | 🚧 Planned |
| IoT Device | 🚧 Planned |

---

# 🎯 Target Users

- Women
- Students
- Working Professionals
- Night Shift Employees
- Solo Travelers
- Elderly Individuals

---

# 🔒 Privacy & Security

SafeHer prioritizes user privacy.

- Secure cloud storage
- Encrypted communication
- Trusted guardian access
- Controlled location sharing
- Authentication-based access

---

# 🤝 Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch
3. Commit changes
4. Push to your branch
5. Open a Pull Request

---

## 👨‍💻 Authors

**Vetrivel A**  
AI • Data Engineering • Backend Development

**Annie Sherlyn R**  
Frontend • Mobile Application Development

---

# 📜 License

This project is licensed under the MIT License.

---

# ⭐ Future Vision

SafeHer aims to evolve beyond a mobile application into a comprehensive women's safety ecosystem by integrating artificial intelligence, wearable technology, predictive analytics, and real-time emergency response systems.

The long-term vision is to enable proactive safety measures rather than reactive emergency responses, ensuring that help reaches users as quickly and intelligently as possible.
