# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **Moodle Mobile App** (v5.1.0) - a cross-platform mobile application built with **Angular 20**, **Ionic 8**, and **Cordova**. It provides mobile access to Moodle learning management systems.

- **Platforms**: Android (Cordova 14.0.1), iOS (Cordova 7.1.1)
- **Node requirement**: v22.17+ (but <23)

## Common Commands

### Development
```bash
npm start                    # Serve in browser with SSL (localhost:8100)
npm run serve:test           # Test server without opening browser
npm run build                # Development build
npm run build:prod           # Production build (optimized)
```

### Testing
```bash
npm test                     # Run all tests with coverage
npm test:watch               # Watch mode with auto-rerun
npm test:ci                  # CI mode (sequential, verbose)
```

Test files use the pattern `**/?(*.)test.ts` and are co-located with source files.

### Linting
```bash
npm run lint                 # Lint TypeScript and HTML templates
```

### Mobile Builds
```bash
npm run dev:android          # Android dev with live reload
npm run dev:ios              # iOS dev build
npm run prod:android         # Android production build
npm run prod:ios             # iOS production build
```

### Pre-build Tasks (Gulp)
Gulp runs automatically before serve/build via npm hooks. Key tasks:
- `lang` - Builds language files into single JSON per language
- `env` - Generates environment-specific config
- `icons` - Builds icons JSON

## Architecture

### Directory Structure
```
src/
├── app/                     # Main app component & routing
├── core/                    # Core framework
│   ├── services/            # 39+ service providers (auth, files, sync, etc.)
│   ├── features/            # Feature modules (login, courses, settings, etc.)
│   ├── components/          # 49 reusable UI components
│   ├── directives/          # Angular directives
│   ├── singletons/          # 40 singleton utilities (DOM, Browser, Events, etc.)
│   ├── classes/             # Base classes & utilities
│   ├── guards/              # Route guards
│   └── initializers/        # App initialization handlers
├── addons/                  # 23 plugin modules
│   ├── mod/                 # Course modules (assignment, quiz, forum, etc.)
│   ├── qtype/               # Question types
│   ├── block/               # Block content
│   └── messages/, badges/, calendar/, etc.
├── testing/                 # Jest testing utilities
├── theme/                   # SCSS theme files
└── assets/                  # Static assets, langpacks
```

### Key Architectural Patterns

**Module Structure**: Each feature/addon follows:
```
feature/
├── feature.module.ts        # Module with routes & providers
├── services/                # Domain services
├── pages/                   # Page components
├── components/              # Feature-specific components
├── constants.ts
└── lang.json                # i18n translations
```

**Services**: Core services handle app-wide concerns:
- `CoreSites` - Multi-site support, session management
- `CoreWS` - WebService communication wrapper
- `CoreFile` / `CoreFilepool` - File management and caching
- `CoreSync` - Offline sync support
- `CoreDB` - SQLite database wrapper
- `CoreEvents` - Global event bus (RxJS Subject-based)
- `CoreNavigator` - Router abstraction

**Delegate Pattern**: Used for extensibility (e.g., `CoreUserDelegate`, `CoreContentLinksDelegate`, `CoreCourseModuleDelegate`)

**Singletons** (`@singletons`): Utility singletons for DOM, Browser, Logger, Colors, Forms, etc.

### TypeScript Path Aliases
```typescript
@services/*      -> src/core/services/
@features/*      -> src/core/features/
@components/*    -> src/core/components/
@directives/*    -> src/core/directives/
@singletons      -> src/core/singletons/
@classes/*       -> src/core/classes/
@addons/*        -> src/addons/
@/*              -> src/
```

### Configuration Files
- `moodle.config.json` - App-specific config (app ID, version, languages, demo sites)
- `angular.json` - Angular CLI config (output: `www/`)
- `ionic.config.json` - Ionic configuration
- `config.xml` - Cordova configuration

## Code Style

- **Indent**: 4 spaces
- **Quotes**: Single quotes in TypeScript
- **Line endings**: LF
- **ESLint**: Flat config in `eslint.config.mjs`
- Uses Angular signals (preferred over traditional inputs)
- Explicit member accessibility (no-public modifier)

## Testing Notes

- Jest with `jest-preset-angular`
- Singleton methods have `mock_*` prefixed jest.fn() mocks
- Setup file: `src/testing/setup.ts`
- Coverage excludes: tests, assets, testing utilities, emulator files

## Important Links

- [Developer documentation](https://moodledev.io/general/app)
- [Development environment setup](https://moodledev.io/general/app/development/setup)
- [Bug Tracker](https://moodle.atlassian.net/browse/MOBILE)
- [Plugin development guide](https://moodledev.io/general/app/development/plugins-development-guide)

## Breaking Changes

See `UPGRADE.md` for API changes affecting site plugins. Notable v5.x changes:
- `moment` removed in favor of `dayjs`
- Ionic 8 upgrade from v7
- Various service renames and parameter changes