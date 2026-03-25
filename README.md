# Cowork — Desktop Agent Workspace

Electron desktop app that combines a React UI, a local OnlyOffice editor (via Docker), and a local agent runtime (Dexter).

## Quick Start (Windows)

1. Install **Docker Desktop** and make sure it is running.
2. Inside `desktop/`, run:
   ```powershell
   npm install
   npm run dev
   ```
3. The app will start Electron, boot Docker services, and open the workspace.

## Project Structure

| Directory | Purpose |
|-----------|---------|
| `desktop/` | Electron shell, React UI, and runtime libraries |
| `dexter/` | Agent server/runtime (spawned by Electron via Bun) |
| `backend/` | Flask backend for the planner API |
| `plugin/` | OnlyOffice plugin (mounted into the container) |
| `shared/` | Shared specs (e.g. presentation schema) |
| `scripts/` | Utility scripts (Docker, packaging, startup) |

## Configuration

Copy `.env.example` to `.env` and fill in your values. The backend has its own `.env` in `backend/.env`.

## Services

- **OnlyOffice** — `http://localhost:8080`
- **Backend** — `http://localhost:8090`
- Ports are configurable via `.env` and auto-picked if busy.

## Desktop Plugin Package (Optional)

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-plugin.ps1
```
