# House of Trials

A full-stack, real-time web application for a college tech fest elimination event. The theme is **Alice in Borderland** — dark, tense, and high-stakes. Built with Next.js 14, Tailwind CSS, and Firebase.

## Technology Stack
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS + Framer Motion
- **Backend / DB / Real-time**: Firebase Firestore & Firebase Authentication
- **Deployment**: Vercel ready

---

## 🚀 Setup Instructions

### 1. Firebase Setup
You need a Firebase project with **Firestore Database** and **Authentication** enabled.

1. Go to the [Firebase Console](https://console.firebase.google.com/) and create a project.
2. Go to **Build > Authentication** and enable **Anonymous** and **Email/Password** sign-in providers.
3. Go to **Build > Firestore Database** and create a database.
4. **Important Firestore Rules**: Note that for production, you should set appropriate security rules. For testing, you can use test mode or allow read/write for authenticated users.


Example generic rule:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}
```

### 2. Environment Variables
Create a `.env.local` file in the root of the project and add your Firebase configuration:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 3. Create the Admin Account
1. Go to the Firebase Console -> Authentication -> Users.
2. Click **Add User** and create an account with email and password.
3. Make sure to use these credentials when logging into `/admin`.

### 4. Run Locally
Install dependencies and run the development server:
```bash
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

---

## 🃏 Game Flow Walkthrough

### Preparation
1. **Initialize Database**: The first time you launch the app, log into `/admin` with your email/password credentials. You will be greeted with an **Initialize Database** button. Click it to automatically scaffold your Firestore collections!
2. **Admin**: Open `/admin/dashboard` in a desktop browser.
3. **Display**: Open `/admin/display` on the projector.
4. **Players**: Go to the landing page `/` and click "Enter the Arena".

### Phase 1: Registration
- Players input their name and college on the `/join` page.
- Upon submission, they are assigned a unique 4-digit ID (e.g. `#0147`) and enter the waiting `/lobby`.

### Phase 2: Start Game
- **Admin**: Clicks `Start Game`. The timer begins.
- **Players**: Are automatically redirected from `lobby` to `/game`. They see the countdown and the 2/3 Average input prompt.
- **Players**: Submit a number between 0 and 100 before the timer finishes.

### Phase 3: Lock and Calculate
- **Admin**: When the timer finishes, the Admin clicks `Lock Submissions` and then `Calculate Result`.
- The server computes the group average, targets `2/3` of the average, and flags the player(s) farthest away.

### Phase 4: Resolution
- **Admin**: Clicks `Reveal Display` to show the target and eliminated players on the projector (`/admin/display`) and on the individual player's phone (`/game`).
- The player screen flashes gold ("You Survived") or red ("You Have Been Eliminated").
- **Admin**: Clicks `Confirm Eliminations` to officially mark players as deceased in the database. Eliminated players are redirected to `/eliminated`.
- **Admin**: Clicks `Next Round (Standby)` to return survived players to the lobby.
