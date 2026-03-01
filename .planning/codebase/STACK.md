# Technology Stack

**Analysis Date:** 2026-03-01

## Languages

**Primary:**
- TypeScript 5.9.3 - Frontend application development
- JavaScript - Build configuration and scripts

**Secondary:**
- HTML5 - Document structure
- CSS3 - Styling

## Runtime

**Environment:**
- Node.js 22.x (managed via nvm on production NAS)
- Browser (client-side execution)

**Package Manager:**
- npm 11.3.0
- Lockfile: Present (`package-lock.json`)

## Frameworks

**Core:**
- React 19.2.0 - UI framework and component rendering
- React DOM 19.2.0 - React rendering for browser DOM
- React Router DOM 7.11.0 - Client-side routing and navigation
- Vite (Rolldown-based) 7.2.5 - Build tool and dev server

**UI Components & Styling:**
- Material-UI (MUI) 7.3.6 - Comprehensive UI component library
  - @mui/material - Core components
  - @mui/icons-material - Icon set
  - @mui/styled-engine-sc - Integration with styled-components
- styled-components 6.1.19 - CSS-in-JS styling solution

**Data Visualization & Flow:**
- @xyflow/react 12.10.0 - Interactive node-based flow diagrams
- dagre 0.8.5 - DAG layout and graph algorithms
- react-to-print 3.2.0 - Print and PDF generation

## Key Dependencies

**Critical:**
- pocketbase 0.26.5 (devDependencies) / 0.26.8 (root) - Backend database client and SDK
  - Enables real-time data sync with PocketBase backend
  - Provides type-safe collection operations
  - Handles authentication and CRUD operations

**Development & Tooling:**
- TypeScript 5.9.3 - Static type checking and compilation
- Vite - Lightning-fast build tool with hot module reloading
- ESLint 9.39.1 - Code quality and style enforcement
- @vitejs/plugin-react 5.1.1 - React integration for Vite
- eslint-plugin-react-hooks 7.0.1 - React hooks linting
- eslint-plugin-react-refresh 0.4.24 - Fast refresh support
- typescript-eslint 8.46.4 - TypeScript linting support

**Type Definitions:**
- @types/react 19.2.5
- @types/react-dom 19.2.3
- @types/node 24.10.1
- @types/styled-components 5.1.36
- @types/dagre 0.7.53

## Configuration

**Environment:**
- Configuration via environment variables using Vite's `import.meta.env`
- Environment file: `.env` in recipe-planner directory
- Key variables:
  - `VITE_POCKETBASE_URL` - Production PocketBase instance URL (default: `http://192.168.50.95:8090`)
  - `VITE_POCKETBASE_TEST_URL` - Test PocketBase instance URL (default: `http://192.168.50.95:8091`)

**Build:**
- `vite.config.ts` - Vite build configuration at `/home/ellio/code/RecipePlanner/recipe-planner/vite.config.ts`
  - Configures React plugin
  - Aliases @mui/styled-engine to @mui/styled-engine-sc
- `tsconfig.json` - Root TypeScript config (references app and node configs)
- `tsconfig.app.json` - Application TypeScript settings
  - Target: ES2022
  - Module system: ESNext with bundler resolution
  - JSX: react-jsx
  - Strict mode enabled
- `tsconfig.node.json` - Node/build tools TypeScript settings
- `eslint.config.js` - Linting rules for TypeScript/React

## Platform Requirements

**Development:**
- Node.js 22.x (via nvm)
- npm 11.3.0+
- TypeScript 5.9.3 (installed locally)

**Production:**
- Node.js 22.x (on NAS running OpenMediaVault)
- serve npm package (static file server)
- Vite-built distributable in `/dist/` directory
- systemd service management on Linux (NAS)

**Deployment Target:**
- Linux NAS (OpenMediaVault) at `192.168.50.95:3000`
- Static file hosting via `serve` package on port 3000
- Service runs under `nasadmin` user account via systemd

---

*Stack analysis: 2026-03-01*
