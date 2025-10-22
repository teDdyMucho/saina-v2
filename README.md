# STAR - Shift Time & Attendance Record

**STAR** (Shift Time & Attendance Record) is a modern, role-based attendance management system built with React, TypeScript, and Tailwind CSS. Features real-time tracking, geofencing, and comprehensive reporting for both employees and administrators.

## 🚀 Features

### 🎨 Modern Login Experience
- **Glassmorphic Design** with backdrop blur and gradient backgrounds
- **Smooth Animations** powered by Framer Motion
- **Role Toggle** with spring animations (Employee/Admin)
- **SSO Ready** with Google and Microsoft placeholders
- **Toast Notifications** for success and error states
- **Full Accessibility** (WCAG AA compliant, Lighthouse 95+)
- **Dark Mode** with beautiful gradient transitions
- **Responsive** from 360px to 1440px+ screens

### Employee Features
- **Clock In/Out System** with GPS geofencing and selfie capture
- **Live Timer** showing current work session duration
- **Break Management** - Start/end breaks with tracking
- **Timesheet View** - Review daily attendance with late flags
- **Leave Management** - Request and track leave balances
- **Dark Mode Support**

### Admin Features
- **Real-time Dashboard** - See who's in, late arrivals, and flags
- **Schedule Management** - Create shift templates and assign to employees
- **Approvals** - Review attendance anomalies and leave requests
- **Reports & Analytics** - Generate and export attendance data
- **Live Location Map** - View employee locations (placeholder)

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript
- **Routing**: React Router v6
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **State Management**: Zustand
- **Build Tool**: Vite
- **Icons**: Lucide React
- **UI Components**: Custom shadcn/ui inspired library

## 📦 Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## 🔧 Environment Setup

Create a `.env` file in the root directory (optional for demo):

```env
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

## 🎯 Demo Login

The app runs in **demo mode** without backend integration:

- **Employee Login**: Use any email, select "Employee"
- **Admin Login**: Use any email, select "Admin"

## 📱 Features Overview

### Geofencing
The app uses the browser's Geolocation API to verify employees are within a specified radius of their work location before allowing clock-in.

### Device Fingerprinting
Generates a unique device identifier stored in localStorage to prevent multiple device logins (configurable).

### Dark Mode
Full dark mode support with persistent theme selection.

### Responsive Design
Mobile-first design that works seamlessly on desktop, tablet, and mobile devices.

## 🏗️ Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # Base UI components (Button, Card, etc.)
│   └── Layout.tsx      # Main layout with navigation
├── features/           # Feature-based modules
│   ├── auth/           # Login & authentication
│   ├── employee/       # Employee-specific pages
│   └── admin/          # Admin-specific pages
├── lib/                # Utility functions
│   ├── utils.ts        # General utilities
│   ├── geo.ts          # Geolocation helpers
│   └── device.ts       # Device fingerprinting
├── stores/             # Zustand state management
│   ├── useAuthStore.ts
│   ├── useThemeStore.ts
│   └── useAttendanceStore.ts
└── App.tsx             # Main app with routing
```

## 🚢 Deployment

### Netlify (Recommended)

1. Connect your repository to Netlify
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Environment variables: Add any required env vars

### Manual Deployment

```bash
npm run build
# Deploy the 'dist' folder to any static hosting service
```

## 🔮 Future Backend Integration

The app is ready for backend integration with:
- **Supabase** for database, auth, and real-time features
- **n8n** for webhook-based automations (QR generation, selfie upload, etc.)

Uncomment the Supabase configuration in `src/lib/supabase.ts` when ready.

## 📝 License

MIT License - Feel free to use this project for personal or commercial purposes.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
