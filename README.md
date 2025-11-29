# Fuga - Ear Training Web App

**Fuga** is a free, web-based ear training application for musicians. Practice interval recognition, interval performance, and fretboard note identification at your own pace.

🎸 **Live Demo:** [https://firelightrpg.github.io/fuga/](https://firelightrpg.github.io/fuga/)

## Features

### Interval Training

- **Guess Mode**: Listen to intervals and identify them
- **Perform Mode**: See an interval name, sing or play it on your instrument (uses microphone for pitch detection)
  - Configurable timer for pressure-based practice
  - Auto-repeats on wrong answers until you get it right
  - Supports melodic intervals only (staccato notes recommended)

### Fretboard Training (Guitar)

- **Find Note (Click)**: Given a note name, click where it appears on the fretboard
- **Find Note (Perform)**: Play the note on your instrument (microphone detects pitch)
- **Identify Note**: See a highlighted fret, select which note it is
- **String Targeting**: Practice specific strings or random strings
- Shows all positions of a note after correct answers

### General Features

- 🌙 **Dark Mode** toggle
- ⌨️ **Keyboard Accessible** (navigate fretboard with Tab/Enter/Space)
- 📱 **Responsive Design**

## Using the App

1. Choose between **Interval Training** or **Fretboard Training**
2. In Interval Training:
   - **Guessing**: Click "Play Random Interval" and select your answer
   - **Perform**: Adjust timer, then sing/play the displayed interval
3. In Fretboard Training:
   - Select your mode and optionally target a specific string
   - Click frets or use your microphone depending on mode

## For Contributors

This project uses:

- **Svelte 5** - UI framework
- **Vite** - Build tool with HMR
- **Prettier** - Code formatting (like Black for Python)
- **ESLint** - Code linting
- **Husky + lint-staged** - Pre-commit hooks
- **GitHub Actions** - CI/CD pipeline

### Development Setup

1. Clone the repository:

   ```sh
   git clone https://github.com/firelightrpg/fuga.git
   cd fuga
   ```

2. Install dependencies:

   ```sh
   npm install
   ```

3. Start development server:
   ```sh
   npm run dev
   ```

### Available Scripts

```sh
npm run dev          # Start development server with HMR
npm run build        # Build for production
npm run preview      # Preview production build
npm run format       # Auto-format all files with Prettier
npm run format:check # Check formatting without changing files
npm run lint         # Run ESLint
```

### Pre-commit Hooks

The project automatically formats and lints code before every commit:

- Prettier formats all staged files
- ESLint fixes auto-fixable issues
- Commits are blocked if there are unfixable errors

To bypass (not recommended): `git commit --no-verify`

### CI/CD Pipeline

- **CI Workflow**: Runs on all pushes/PRs - checks formatting, linting, and builds
- **Deploy Workflow**: Runs on pushes to main - deploys to GitHub Pages after CI passes

### Project Structure

```
fuga/
├── src/
│   ├── App.svelte          # Main application component
│   ├── lib/
│   │   ├── Fretboard.svelte # Guitar fretboard visualization
│   │   └── Counter.svelte   # Example component (unused)
│   ├── main.js             # App entry point
│   └── app.css             # Global styles
├── .github/workflows/      # CI/CD workflows
├── .husky/                 # Git hooks
└── public/                 # Static assets
```

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes (pre-commit hooks will run automatically)
4. Push and create a pull request
5. CI must pass before merge

## Technical Notes

### Browser Compatibility

- Requires Web Audio API support (all modern browsers)
- Microphone access required for "Perform" modes
- Works best in Chromium-based browsers (Chrome, Edge, Brave)
- Firefox may have some pitch detection quirks

### Known Limitations

- Perform mode only supports melodic intervals (not harmonic)
- Pitch detection requires clear, sustained notes
- Fretboard currently shows standard tuning (E-A-D-G-B-e) only

## License

MIT

---

## Svelte + Vite Technical Details

This project was bootstrapped with Svelte + Vite.
// store.js
// An extremely simple external store
import { writable } from 'svelte/store';
export default writable(0);

```

```
