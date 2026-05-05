# Option

Your academic life, automated & optimized. Option is a student productivity app that combines grade tracking, smart calendar scheduling, and focus tools into one platform.

## Features

- **Smart Calendar** - Eisenhower priority matrix with AI-powered auto-scheduling that places study blocks on your Google Calendar
- **Gradebook** - Sync grades from StudentVUE with weighted/unweighted GPA calculation, what-if scenarios, and target grade tools
- **Focus Timer** - Pomodoro-style study timer with session tracking and weekly analytics
- **Schoology Import** - Pull assignments directly from your Schoology calendar feed
- **Google Calendar Integration** - OAuth sign-in, FreeBusy conflict detection, and automatic event creation
- **Per-Day Working Hours** - Set custom availability windows for each day of the week

## Tech Stack

- React Native + Expo (cross-platform: iOS, Android, Web)
- Supabase (auth + PostgreSQL)
- Google Calendar API v3
- Vercel (web hosting + serverless API routes)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm (comes with Node.js)
- [Expo Go](https://expo.dev/go) app on your phone (for mobile testing)

### Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/EshanthPen/option-app.git
   cd option-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the dev server**
   ```bash
   # Web
   npm run web

   # iOS (requires Expo Go app)
   npm run ios

   # Android (requires Expo Go app)
   npm run android

   # All platforms
   npm start
   ```

4. **Open in browser**
   The web version will be available at `http://localhost:8081`. Scan the QR code with Expo Go for mobile.

### Google Calendar Setup (Optional)

To use the Google Calendar features locally:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable the **Google Calendar API**
3. Create an **OAuth 2.0 Client ID** (Web application type)
4. Add `http://localhost:8081` to both:
   - Authorized JavaScript origins
   - Authorized redirect URIs
5. The Client ID is already configured in the app. If you want to use your own, update it in `src/screens/SettingsScreen.js`

### StudentVUE Setup (Optional)

StudentVUE grade syncing works through a serverless proxy. When running locally, the proxy runs at `/api/studentvue`. For this to work on `localhost`, you need:

```bash
npx vercel dev
```

This starts the Vercel dev server which handles the API routes in the `api/` folder.

## Project Structure

```
option-app/
├── api/                    # Vercel serverless functions
│   ├── schoology.js        #   ICS proxy for Schoology calendar feeds
│   └── studentvue.js       #   SOAP proxy for StudentVUE grade portals
├── assets/                 # App icons, splash screens, fonts
├── src/
│   ├── components/         # Reusable UI components
│   │   ├── DistrictPickerModal.js
│   │   ├── TabNavigator.js
│   │   └── WorkingHoursGraph.js
│   ├── context/
│   │   └── ThemeContext.js  # Light/dark mode
│   ├── screens/
│   │   ├── AuthScreen.js        # Login / signup
│   │   ├── DashboardScreen.js   # Home tab
│   │   ├── GradebookScreen.js   # Grade tracking + calculators
│   │   ├── MatrixScreen.js      # Calendar + task management
│   │   ├── ScreentimeScreen.js  # Pomodoro focus timer
│   │   ├── SettingsScreen.js    # Integrations + config
│   │   └── WelcomeScreen.js     # Landing page
│   ├── utils/
│   │   ├── auth.js              # User ID management
│   │   ├── googleCalendarAPI.js # Google Calendar API helpers
│   │   ├── mockStudentData.js   # Demo grade data
│   │   ├── schedulerAssistant.js # AI scheduling engine
│   │   ├── studentVueAPI.js     # StudentVUE SOAP client
│   │   ├── studentVueParser.js  # XML grade parser
│   │   └── theme.js             # Design tokens
│   └── supabaseClient.js   # Supabase connection
├── app.json                # Expo config
├── App.js                  # Root component + navigation
├── vercel.json             # Vercel deployment config
└── package.json
```

## Deployment

The app deploys to Vercel automatically on push to `main`:

```bash
# Manual web export
npx expo export -p web

# The output goes to dist/ which Vercel serves
```

## License

Private project by [@EshanthPen](https://github.com/EshanthPen).
