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

   - Admin sign-in: [http://localhost:3000/login.html](http://localhost:3000/login.html) (default credentials `admin` / `ChangeMe123!` – you’ll be asked to set a new password immediately).
   - Admin console: [http://localhost:3000](http://localhost:3000)
   - Intern availability portal: [http://localhost:3000/availability.html](http://localhost:3000/availability.html)

The API and the static frontend are served from the same Node.js process. All data is persisted inside `server/data/store.json`.

## Admin accounts

- Sign in from `/login.html` using the credentials supplied by an existing admin. The bundled seed account is `admin` / `ChangeMe123!` and is forced to change its password on first login.
- Create additional admins from the **Admin access** panel in the console. You can provide a temporary password or let the app generate one for you.
- After five failed login attempts the “Forgot password?” link appears. Verifying the username/email combination issues a temporary password and flags the account to change it on next sign-in.
- Use the change-password form in the console header whenever you need to rotate your own credentials.

## Intern availability portal

- Share the `/availability.html` link with interns so they can submit their own time windows.
- The portal only exposes the availability form and the intern's previously submitted entries—no scheduling dashboards are visible.
- Training requests automatically require an available trainer before the submission is accepted.
- Interns can queue multiple time windows in one visit and submit them together so complex days are captured in a single action.
- Submitted windows immediately surface in the admin console with a readable day/time preview so reviewers can see requests at a glance.

## Exporting the schedule

- After generating or updating the schedule, use the **Export schedule** card in the admin console to download:
  - **Teams Shifts CSV** – preformatted with ISO timestamps, station numbers, and trainer notes for quick import into Microsoft Teams Shifts.
  - **Excel CSV** – Monday through Sunday columns with each intern occupying two rows (name + scheduled windows) so the sheet mirrors the planner shown in the reference screenshots.
    - Example row structure:

      | Monday         | Tuesday        | Wednesday      | Thursday       | Friday         | Saturday | Sunday |
      | -------------- | -------------- | -------------- | -------------- | -------------- | -------- | ------ |
      | A. Forbes      | A. Forbes      | A. Forbes      | A. Forbes      | A. Forbes      |          |        |
      | 8:00 A.M.–5:00 P.M. | 8:00 A.M.–1:00 P.M. | 8:00 A.M.–5:00 P.M. | 8:00 A.M.–5:00 P.M. | 8:00 A.M.–5:00 P.M. |          |        |
  - Buttons stay disabled until at least one assignment exists, ensuring exports always reflect the most recent schedule snapshot.

## API overview

| Method | Endpoint | Description |
| ------ | -------- | ----------- |
| POST | `/api/auth/login` | Sign in with `{ username, password }` and receive an authenticated session cookie. |
| POST | `/api/auth/logout` | Destroy the current session. |
| GET | `/api/auth/session` | Return the active admin profile (401 if not authenticated). |
| POST | `/api/auth/change-password` | Update the signed-in admin password (`currentPassword`, `newPassword`). |
| GET | `/api/auth/admins` | List admin accounts (requires authentication). |
| POST | `/api/auth/admins` | Create an admin with `{ name, email, username, password? }`. Generates a temporary password if one is not supplied. |
| POST | `/api/auth/request-reset` | Verify `{ username, email }` and issue a temporary password for the matching admin. |
| GET | `/api/interns` | List interns. |
| POST | `/api/interns` | Create a new intern (`name`, `isTrainer`, `requiresTrainer`). Requires authentication. |
| GET | `/api/availabilities` | List availability submissions. Provide `?internId=...` to filter for a single intern (unauthenticated) or omit it to retrieve the full list (requires authentication). |
| POST | `/api/availabilities` | Submit availability for one or more windows. Accepts a single window (`internId`, `day`, `start`, `end`, `sessionType`, optional `trainerId`) or `{ internId, entries: [...] }` to save several at once. |
| DELETE | `/api/availabilities/:id` | Remove an availability entry. |
| POST | `/api/schedule/generate` | Generate a new schedule using current availability. Requires authentication. |
| GET | `/api/schedule` | Fetch the latest generated schedule and open slot summary. Requires authentication. |
| PUT | `/api/schedule/assignment/:id` | Manually adjust an assignment (day, start, end, station). Requires authentication. |
| POST | `/api/schedule/assignment` | Create a manual assignment or duplicate an existing one. Requires authentication. |
| DELETE | `/api/schedule/assignment/:id` | Delete an assignment from the schedule. Requires authentication. |

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
