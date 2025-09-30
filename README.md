# Advance Scheduler

Advance Scheduler is a zero-dependency Node.js web application that collects intern availability, automatically generates a fair floor schedule across nine stations, and exposes a calendar interface for quick manual adjustments.

## Features

- **Availability intake** – interns submit the windows they can work, including optional trainer pairings for onboarding shifts.
- **Intern-only availability portal** – dedicated submission page interns can open without exposing admin scheduling tools.
- **Fair auto-scheduling** – balances requested hours against the nine-station capacity on an hour-by-hour basis while keeping training pairs on the same station.
- **Open-slot surfacing** – highlights empty stations that can be offered to interns when capacity is available.
- **FullCalendar interface** – drag-and-drop adjustments, duplication and removal of assignments directly from the calendar.
- **One-click exports** – download the generated week for Microsoft Teams Shifts or Excel to share staffing plans instantly.
- **Transparency dashboards** – summarize requested vs. assigned hours and day-by-day coverage to help maintain fairness.

## Getting started

1. **Install Node.js** (18+) locally.
2. **Install dependencies** – the project is dependency-free so there is nothing to install.
3. **Run the application**:

   ```bash
   npm start
   ```

4. **Open the UI**:

   - Admin console: [http://localhost:3000](http://localhost:3000)
   - Intern availability portal: [http://localhost:3000/availability.html](http://localhost:3000/availability.html)

The API and the static frontend are served from the same Node.js process. All data is persisted inside `server/data/store.json`.

## Intern availability portal

- Share the `/availability.html` link with interns so they can submit their own time windows.
- The portal only exposes the availability form and the intern's previously submitted entries—no scheduling dashboards are visible.
- Training requests automatically require an available trainer before the submission is accepted.
- Interns can queue multiple time windows in one visit and submit them together so complex days are captured in a single action.
- Submitted windows immediately surface in the admin console with a readable day/time preview so reviewers can see requests at a glance.

## Exporting the schedule

- After generating or updating the schedule, use the **Export schedule** card in the admin console to download:
  - **Teams Shifts CSV** – preformatted with ISO timestamps, station numbers, and trainer notes for quick import into Microsoft Teams Shifts.
  - **Excel CSV** – organized by day with station, session type, and source metadata for lightweight analysis or sharing.
- Buttons stay disabled until at least one assignment exists, ensuring exports always reflect the most recent schedule snapshot.

## API overview

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/interns` | List interns. |
| POST | `/api/interns` | Create a new intern (`name`, `isTrainer`, `requiresTrainer`). |
| GET | `/api/availabilities` | List availability submissions. |
| POST | `/api/availabilities` | Submit availability for one or more windows. Accepts a single window (`internId`, `day`, `start`, `end`, `sessionType`, optional `trainerId`) or `{ internId, entries: [...] }` to save several at once. |
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
- The generator also tracks hours awarded per day so interns who have not yet worked that day are prioritized before doubling up on the same people.
- Trainers must have overlapping availability to cover a training request; otherwise the session is skipped.
- The generator records waitlisted interns for any hour that exceeds the station limit and surfaces empty stations as actionable open slots.

## Data persistence

All data lives in `server/data/store.json`. Back up this file before redeploying if you want to preserve historical submissions.

The repository ships with a representative demo roster covering Monday–Friday so the scheduler immediately showcases even distribution across the week. Feel free to clear the file contents or replace them with your own data when moving to production.

## Development notes

- The UI uses the CDN build of [FullCalendar](https://fullcalendar.io/) and modern CSS for styling.
- The server relies solely on Node.js core modules to simplify deployment in restricted environments.
- Feel free to extend the generator with additional fairness rules (e.g., prioritizing trainees, minimum weekly hours) as business requirements evolve.
