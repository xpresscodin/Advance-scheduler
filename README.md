# Advance Scheduler

Advance Scheduler is a zero-dependency Node.js web application that collects intern availability, automatically generates a fair floor schedule across nine stations, and exposes a calendar interface for quick manual adjustments.

## Features

- **Availability intake** – interns submit the windows they can work, including optional trainer pairings for onboarding shifts.
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

4. **Open the UI** at [http://localhost:3000](http://localhost:3000).

The API and the static frontend are served from the same Node.js process. All data is persisted inside `server/data/store.json`.

## API overview

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| GET | `/api/interns` | List interns. |
| POST | `/api/interns` | Create a new intern (`name`, `isTrainer`, `requiresTrainer`). |
| GET | `/api/availabilities` | List availability submissions. |
| POST | `/api/availabilities` | Submit availability (`internId`, `day`, `start`, `end`, `sessionType`, optional `trainerId`). |
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
