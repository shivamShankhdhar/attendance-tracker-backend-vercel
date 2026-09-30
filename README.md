# attendance-tracker-backend-vercel

### Attendance exploration and reporting

- `GET /api/v1/workplaces/:workplaceId/attendance/today?date=YYYY-MM-DD` returns the current active/invited employee roster for the selected day, including pending and unmarked states. Omitting `date` uses today in the workplace timezone; future dates are rejected.
- `GET /api/v1/workplaces/:workplaceId/attendance/reports` accepts either `month=YYYY-MM` or inclusive `startDate` and `endDate`, plus optional `employeeMemberId` and `status` (`PRESENT`, `ABSENT`, `HALF_DAY`, `LEAVE`). Reports remain employer-only and workplace-scoped.
- Reports return filtered `records`, `summary` (including unique employees and days with records), and ascending `daily` status totals for charts. Attendance percentage uses present + half-day × 0.5 divided by marked records; it does not infer absences for unmarked days.
- Invalid calendar dates, incomplete/reversed ranges, and a month combined with a range return validation errors. The report export screen inherits the active report filters.
