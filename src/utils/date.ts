/**
 * Returns the logical date in 'YYYY-MM-DD' format for a given instant and timezone
 */
export function getWorkplaceLocalDate(date: Date = new Date(), timezone: string = 'Asia/Kolkata'): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date); // 'YYYY-MM-DD'
  } catch (err) {
    // Fallback to UTC if timezone is invalid
    console.warn(`[Date] Invalid timezone "${timezone}", falling back to UTC:`, err);
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Returns the current time formatted in HH:mm in the given timezone
 */
export function getWorkplaceLocalTime(date: Date = new Date(), timezone: string = 'Asia/Kolkata'): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return formatter.format(date);
  } catch {
    return date.toISOString().slice(11, 19);
  }
}

/**
 * Validates whether a timezone identifier is valid
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
