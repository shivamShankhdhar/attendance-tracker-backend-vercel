import { AppError } from '../../middleware/errorHandler';

/** Convert the employee's wall-clock time in the workplace timezone, never the server timezone. */
export function localRequestInstant(date: string, time: string, timezone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new AppError('Choose a valid date and 24-hour time', 400, 'INVALID_REQUEST_TIME');
  }
  const target = Date.parse(`${date}T${time}:00Z`);
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  let instant = target;
  for (let i = 0; i < 4; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(instant)).map(p => [p.type, p.value]));
    const wall = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    if (wall === target) return new Date(instant);
    instant += target - wall;
  }
  throw new AppError('That local time does not exist. Choose another time.', 400, 'INVALID_REQUEST_TIME');
}
