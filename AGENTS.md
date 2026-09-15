# Esports Platform — Base44 Dev Environment

## Overview

School-based esports team-management application. Currently a frontend-only application shell with role-based navigation (Coach, Player, Administration). Full backend and business logic will be implemented from an authoritative implementation contract.

## Tech Stack

- **Frontend:** React 18 + Vite 6 + TypeScript
- **Styling:** Tailwind CSS 3
- **Routing:** React Router 6
- **Icons:** lucide-react

## Running the App

```bash
docker compose -f docker-compose.base44.yml up -d
```

The Vite dev server runs on port 5173 inside the container, mapped to host port 3000. Live reload is active — edits to `frontend/src/` appear immediately in the preview.

## Project Structure

```
frontend/
  src/
    config/navigation.tsx    — role-based nav config (single source of truth for routes & labels)
    components/
      Layout.tsx             — app shell: sidebar + header + content outlet
      Sidebar.tsx            — role-aware navigation sidebar
      RoleSwitcher.tsx       — Coach/Player/Admin role toggle
      PlaceholderPage.tsx    — renders placeholder for each nav area
      PlaceholderPage.tsx    — wrapper that looks up nav item by role+path
    App.tsx                  — route definitions
```

## Key Design Decisions

- Navigation is defined in a single config file (`config/navigation.tsx`). Adding a new page = add a route in `App.tsx` + an entry in the nav config.
- Role switching is client-side state in `Layout.tsx`. No auth or backend yet.
- No external secrets required — the app is a pure frontend shell.

## Verification

- `curl http://localhost:3000/` returns the Vite dev HTML (not a prebuilt bundle).
- Switch roles via the top-right toggle; sidebar and route update to that role's pages.
- Each placeholder page shows its icon, title, description, and a note that full functionality comes from the implementation contract.
