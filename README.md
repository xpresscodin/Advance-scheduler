# Advance Scheduler

Advance Scheduler is a zero-dependency Node.js web application that collects intern availability, automatically generates a fair floor schedule across nine stations, and exposes a calendar interface for quick manual adjustments.

## Features

- **Availability intake** – interns submit the windows they can work, including optional trainer pairings for onboarding shifts.
codex/create-web-application-for-schedule-management-ew0h25
- **Intern-only availability portal** – dedicated submission page interns can open without exposing admin scheduling tools.

main
- **Fair auto-scheduling** – balances requested hours against the nine-station capacity on an hour-by-hour basis while keeping training pairs on the same station.
- **Open-slot surfacing** – highlights empty stations that can be offered to interns when capacity is available.
- **FullCalendar interface** – drag-and-drop adjustments, duplication and removal of assignments directly from the calendar.
- **Transparency dashboards** – summarize requested vs. assigned hours to help maintain fairness.

## Getting started

1. **Install Node.js** (18+) locally.
2. **Install dependencies** – the project is dependency-free so there is nothing to install.
3. **Run the application**:

   ```bash
   npm start
   ```

codex/create-web-application-for-schedule-management-ew0h25
4. **Open the UI**:

   - Admin console: [http://localhost:3000](http://localhost:3000)
   - Intern availability portal: [http://localhost:3000/availability.html](http://localhost:3000/availability.html)

The API and the static frontend are served from the same Node.js process. All data is persisted inside `server/data/store.json`.

## Deploying to Vercel

Vercel can host the API as a serverless function while serving the static client from the `client/` directory configured as the public folder.

1. Install the [Vercel CLI](https://vercel.com/docs/cli) and authenticate with `vercel login`.
2. From the repository root run `vercel` and accept the defaults. The included `vercel.json`:
   - Treats `client/` as the static public directory so `index.html`, `availability.html`, and related assets are hosted automatically at the site root.
   - Deploys the Node handler in `api/index.js` using the Node.js 18 runtime so all `/api/*` routes work the same as they do locally.
   - Rewrites `/availability` to `availability.html` so the intern-friendly link continues to work once deployed.
   - Seeds each deployment with the sample data from `server/data/store.json` by copying it into an ephemeral `/tmp` directory when the function boots.
3. Promote a preview to production with `vercel --prod` when you are satisfied.

> **Note:** Vercel’s serverless filesystem is ephemeral. Availability submissions and generated schedules reset whenever the function is re-created unless you replace the JSON data store with a persistent database.

## Intern availability portal

- Share the `/availability.html` link with interns so they can submit their own time windows.
- The portal only exposes the availability form and the intern's previously submitted entries—no scheduling dashboards are visible.
- Training requests automatically require an available trainer before the submission is accepted.
- Interns can queue multiple time windows in one visit and submit them together so complex days are captured in a single action.


4. **Open the UI** at [http://localhost:3000](http://localhost:3000).

The API and the static frontend are served from the same Node.js process. All data is persisted inside `server/data/store.json`.

main
## API overview

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/interns` | List interns. |
| POST | `/api/interns` | Create a new intern (`name`, `isTrainer`, `requiresTrainer`). |
| GET | `/api/availabilities` | List availability submissions. |
 codex/create-web-application-for-schedule-management-ew0h25
| POST | `/api/availabilities` | Submit availability for one or more windows. Accepts a single window (`internId`, `day`, `start`, `end`, `sessionType`, optional `trainerId`) or `{ internId, entries: [...] }` to save several at once. |

| POST | `/api/availabilities` | Submit availability (`internId`, `day`, `start`, `end`, `sessionType`, optional `trainerId`). |
main
| DELETE | `/api/availabilities/:id` | Remove an availability entry. |
| POST | `/api/schedule/generate` | Generate a new schedule using current availability. |
| GET | `/api/schedule` | Fetch the latest generated schedule and open slot summary. |
| PUT | `/api/schedule/assignment/:id` | Manually adjust an assignment (day, start, end, station). |
| POST | `/api/schedule/assignment` | Create a manual assignment or duplicate an existing one. |
| DELETE | `/api/schedule/assignment/:id` | Delete an assignment from the schedule. |

## Scheduling logic

- Time is evaluated in one-hour blocks between 07:00 and 22:00.
- A maximum of nine stations may be active each hour; training pairs share a station while counting both the trainee and the trainer toward fairness metrics.
- Candidates for each hour are sorted by their assigned/requested hour ratio, ensuring interns with fewer assigned hours are prioritized.
- Trainers must have overlapping availability to cover a training request; otherwise the session is skipped.
- The generator records waitlisted interns for any hour that exceeds the station limit and surfaces empty stations as actionable open slots.

## Data persistence

All data lives in `server/data/store.json`. Back up this file before redeploying if you want to preserve historical submissions.

## Development notes

- The UI uses the CDN build of [FullCalendar](https://fullcalendar.io/) and modern CSS for styling.
- The server relies solely on Node.js core modules to simplify deployment in restricted environments.
- Feel free to extend the generator with additional fairness rules (e.g., prioritizing trainees, minimum weekly hours) as business requirements evolve.
