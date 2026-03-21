# Option — Feature Reference

A comprehensive student academic productivity and focus management platform built with React Native/Expo for web, iOS, and Android.

---

## Current Features

### Authentication & Profile Management
- Email/password sign-up and login via Supabase Auth
- User profile creation with display name and school information
- Optional Schoology URL integration during signup
- Email verification flow with success notifications
- Avatar system with presets and custom upload
- Unique friend codes for social discovery

### Dashboard & Grade Tracking
- Real-time grade monitoring from StudentVUE integration
- Weighted GPA (WGPA) calculation — AP courses +1.0 bonus, Honors +0.5 bonus
- Unweighted GPA (UGPA) calculation
- Course type classification (AP, HN, REG) with automatic detection
- At-risk grade tracking (courses below 83%, sorted by severity)
- Upcoming assignments view (next 7 days) with due dates
- Class overview with progress bars for each course
- Personalized greeting based on time of day
- Focus Score widget showing current productivity metric

### Gradebook Integration
- Full StudentVUE synchronization via SOAP protocol
- Support for multiple school districts (FCPS, PWCS, LCPS, Beaverton, Albuquerque, Chesapeake, Roanoke County, and custom URLs)
- Manual gradebook entry fallback
- Assignment-level tracking with scores and totals
- Grade change notifications and alerts
- Period/quarter information
- Mock data generation for demo purposes

### Calendar & Task Management (Matrix Screen)
- Interactive calendar view (month view with day-by-day cells)
- Manual task creation with title, description, urgency (1–10), importance (1–10), duration (minutes), difficulty (1–10), and due date
- Task storage in Supabase
- Schoology calendar import (iCal format) with auto-parsing
- Google Calendar free/busy checking
- Task export/import functionality

### Smart Scheduling Engine
- **Eisenhower Priority Matrix** implementation (Q1–Q4 quadrants)
  - Q1 (Do Now): Urgency >= 7 AND Importance >= 7
  - Q2 (Plan): Urgency < 7 AND Importance >= 7
  - Q3 (Limit): Urgency >= 7 AND Importance < 7
  - Q4 (Defer): Urgency < 7 AND Importance < 7
- **Priority scoring algorithm** combining:
  - Importance score (35% weight)
  - Urgency score (25% weight)
  - Due pressure calculation (20% weight)
  - Effort weighting (10% weight)
  - Quadrant boost (10% weight)
- Intelligent block splitting for large tasks
- Spaced scheduling to distribute workload
- Working hours configuration per day of week
- Calendar slot scoring for optimal task placement
- Conflict detection and rebalancing
- Google Calendar integration for scheduling conflicts

### Focus Score & Pomodoro Timer
- Interactive Pomodoro timer (25-minute work / break cycles)
- Session tracking with persistent storage
- Weekly focus metrics display
- 7-day activity tracking with daily hours
- Focus score computation: `(minutes_this_week / 1500) * 100`, capped at 100
- Focus score syncing to Supabase for leaderboard
- Score labels: Excellent, Good, Fair, Poor
- Streak tracking (consecutive active days, 7-day max)
- Visual progress ring display

### Website Blocking & Focus Mode
- Blacklist manager for distracting domains
- Block/unblock functionality per session
- **Chrome Extension** for browser-based blocking:
  - Manifest V3 with Declarative Net Request API
  - Preset categories: Social Media, Gaming, Entertainment, News, Shopping
  - Custom domain blocking
  - Blocked page redirect with motivational messaging

### Leaderboard & Social Features
- Friend leaderboard (friends only)
- School leaderboard (school-wide rankings)
- Global leaderboard (all users)
- Time period filtering (weekly / monthly)
- Friend discovery via unique friend codes
- Add/remove friends functionality
- User ranking display with medals and badges
- Friend code copy-to-clipboard

### Settings & Customization
- Theme toggle (light/dark mode, neo-brutalist design)
- Profile editing (name, school, display picture)
- Working hours configuration with visual graph editor (per day of week)
- Notification preferences for grade changes
- Google Calendar OAuth integration
- StudentVUE district selection with search
- Schoology calendar sync
- All settings persisted to AsyncStorage and Supabase

### Grade Notifications & Alerts
- Automatic grade change detection via snapshot comparison
- Alert on new assignments
- Alert on individual score changes
- Alert on class grade changes
- Optional notification enable/disable toggle
- Background notification system via Expo Notifications

### Web Platform Support
- Full web deployment via Vercel
- Responsive design for desktop, tablet, and mobile
- Sidebar navigation (expandable on web, icon-only on mobile)
- Web-specific OAuth redirect handling
- Storage fallback (localStorage + AsyncStorage)

### UI & Design System
- Neo-brutalist design with thick borders and strong typography
- Custom fonts: Cormorant Garamond, DM Mono, Instrument Sans, Playfair Display, Chewy
- Theme context for consistent light/dark styling
- Loading states and error handling
- Modal dialogs, progress indicators, and visual feedback
- Responsive layout system

---

## Future / Planned Features

These features are listed on the Coming Soon screen and in placeholder infrastructure throughout the codebase.

### 1. AI Image Parsing
Take a photo of a whiteboard or handwritten notes to auto-generate tasks. Uses image recognition to extract assignment details and create task entries automatically.

### 2. Native Schoology Sync
Background fetching of assignments directly from the user's LMS URL. Eliminates the need for manual iCal export by pulling assignment data automatically on a recurring schedule.

### 3. Native Screen Blocking (iOS)
A strict focus mode that locks apps on iOS devices via Apple's Screen Time API. Goes beyond browser-level blocking to enforce device-wide restrictions during study sessions.

### 4. Google Calendar Auto-Scheduling
Automatically insert Option-generated tasks into empty slots on the user's Google Calendar. The scheduling engine already computes optimal slots — this feature writes them back to Google Calendar as events.

### 5. Auto-Scheduler View
A dedicated screen (`CalendarScreen.js`) for visualizing scheduled time blocks. Infrastructure exists with placeholder UI: "Your scheduled time blocks will appear here."

### 6. System-Level Website Blocking
The blocker API server (`blocker-api/server.js`) supports CLI-based `/etc/hosts` file manipulation for native system-level blocking on Linux and macOS, extending blocking beyond the Chrome extension.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React Native 0.81.5, Expo ~54.0.0, React 19.1.0 |
| Web | React Native Web 0.21.0, Vercel |
| Navigation | React Navigation 7.x (bottom tabs) |
| Database | Supabase (PostgreSQL + Auth + Storage) |
| Local Storage | AsyncStorage |
| Calendar Parsing | iCal.js, fast-xml-parser |
| Auth | Supabase Auth, Expo Auth Session, Google OAuth |
| Notifications | Expo Notifications, Expo Background Fetch |
| Icons | Lucide React Native |
| Charts | React Native Chart Kit |
| Browser Extension | Chrome Manifest V3, Declarative Net Request API |
| Deployment | Vercel (web + serverless), EAS (native builds) |

---

## Database Schema

| Table | Purpose |
|---|---|
| `profiles` | User profiles: display name, avatar, school, friend code, focus scores |
| `friendships` | Friend relationships between users |
| `focus_scores` | Daily focus score history with breakdowns |
| `tasks` | User tasks with urgency, importance, duration, difficulty, due date |
| `settings` | Per-user device-specific configuration (e.g. Schoology URL) |

---

## API Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/studentvue` | POST | SOAP proxy for StudentVUE grade fetching |
| `/api/schoology` | GET | iCalendar proxy for Schoology assignment import |
| `/block` | POST | System-level website blocking (blocker API) |
| `/unblock` | POST | Remove all blocked websites (blocker API) |
