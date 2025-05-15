import { Duration, DurationLikeObject } from 'luxon';

// New regex that enforces order and optional presence of each unit.
// It expects the string to be d-h-m-s order.
const STRICT_DURATION_REGEX = /^(?:(\d+)d)?\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?$/;

/**
 * Parses a relaxed duration string (e.g., "7d", "3d6h30m10s") into a Luxon Duration object.
 * The string must have units in the order of days, hours, minutes, seconds (d, h, m, s).
 * Each unit can appear at most once.
 * Whitespace around and within the duration string is trimmed/removed.
 * Returns a Luxon Duration object, or null if the string is invalid or results in a zero duration.
 *
 * @param durationStr The string to parse.
 * @returns A Luxon Duration object, or null if the string is invalid or results in a zero duration.
 */
export const parseDuration = (durationStr: string): Duration | null => {

  // Trim leading/trailing whitespace and remove all internal whitespace
  const sanitizedStr = durationStr.trim().replace(/\\s+/g, '');

  if (sanitizedStr === '') {
    // If, after sanitization, the string is empty (e.g., input was "   " or empty)
    // but the original function returned null for "   " due to DURATION_REGEX.replace leaving it non-empty
    // and then remainingStr.trim() !== '' being false.
    // The new tests expect '   ' to be null, and ' 7d ' to be 7d.
    // An empty string after sanitization means no parsable content.
    return null;
  }

  const match = sanitizedStr.match(STRICT_DURATION_REGEX);

  if (!match || match[0] !== sanitizedStr) {
    // If the regex doesn't match the entire sanitized string, it's invalid.
    // This also covers cases where the string has content but it's not a valid duration format at all (e.g., "abc")
    // or has out-of-order/repeated units that STRICT_DURATION_REGEX won't fully match.
    console.warn(`Invalid duration string format, order, or unparsed characters: '${durationStr}', sanitized to: '${sanitizedStr}'`);
    return null;
  }

  const units: DurationLikeObject = {};
  let found = false;

  // Extract values from regex groups. Group 0 is the full match.
  // Group 1: days, Group 2: hours, Group 3: minutes, Group 4: seconds
  const d = match[1] ? parseInt(match[1], 10) : 0;
  const h = match[2] ? parseInt(match[2], 10) : 0;
  const m = match[3] ? parseInt(match[3], 10) : 0;
  const s = match[4] ? parseInt(match[4], 10) : 0;

  if (d < 0 || h < 0 || m < 0 || s < 0) {
    console.warn(`Invalid negative value in duration string: ${durationStr}`);
    return null;
  }
  // isNaN check is implicitly handled by parseInt (NaN results) and subsequent checks,
  // or STRICT_DURATION_REGEX ensures \\d+

  if (d > 0) { units.days = d; found = true; }
  if (h > 0) { units.hours = h; found = true; }
  if (m > 0) { units.minutes = m; found = true; }
  if (s > 0) { units.seconds = s; found = true; }
  
  // Special case for "0s", "0d0h0m0s", etc.
  // If no positive units were found, but the input string was not empty (e.g. "0s", "0d"), it's a zero duration.
  // The regex allows "0d", "0h", etc.
  if (!found && sanitizedStr.length > 0 && (d === 0 || h === 0 || m === 0 || s === 0) && /[dhms]/.test(sanitizedStr)) {
      // Check if at least one of the parsed values (d,h,m,s) was explicitly zero from a "0d" like part
      // and the string contained at least one unit char.
      // This means the input was like "0s" or "0d0h".
      if (match[1] || match[2] || match[3] || match[4]) { // if any group was matched (even if value was 0)
          found = true; // Treat as found for zero duration purposes
      }
  }


  if (!found) {
    // If no units were found (e.g. "abc", or if sanitizedStr became empty and wasn't caught above)
    console.warn(`No valid duration units found in string: '${durationStr}'`);
    return null;
  }

  const duration = Duration.fromObject(units);

  // Luxon Duration.fromObject({}) creates a zero duration.
  // If all parsed values were 0 (e.g. "0d0h0m0s" or "0s"), duration.as('milliseconds') will be 0.
  // The 'found' flag handles this: if 'found' is true, it means we parsed actual units (even if they summed to 0).
  // If 'found' is false (e.g. "abc" or an empty string that slipped through), we've already returned null.

  // The previous check:
  // if (duration.as('milliseconds') === 0 && Object.keys(units).length > 0) { return duration; }
  // else if (duration.as('milliseconds') === 0) { return null; }
  // can be simplified because `found` now tells us if we parsed anything meaningful.
  // If `found` is true, `duration` is valid, even if it's zero.
  // If `found` is false, we've already returned null.

  return duration;
};

/**
 * Formats a Luxon Duration object into a relaxed string format (e.g., "3d6h30m10s").
 * Omits zero value components unless the total duration is zero (returns "0s").
 *
 * @param duration The Luxon Duration object to format.
 * @returns The formatted duration string.
 */
export const durationStr = (duration: Duration): string => {
  // Shift the duration to the units we care about for string formatting.
  // This will convert, for example, 900 minutes into { hours: 15, minutes: 0 } etc.
  const shifted = duration.shiftTo('days', 'hours', 'minutes', 'seconds');

  // console.log('Original duration:', duration.toObject());
  // console.log('Shifted duration:', shifted.toObject());

  const days = Math.floor(shifted.get('days'));
  const hours = Math.floor(shifted.get('hours'));
  const minutes = Math.floor(shifted.get('minutes'));
  const seconds = Math.floor(shifted.get('seconds'));

  let result = '';
  if (days > 0) result += `${days}d`;
  if (hours > 0) result += `${hours}h`;
  if (minutes > 0) result += `${minutes}m`;
  if (seconds > 0) result += `${seconds}s`;

  if (result === '') {
    // This handles two cases:
    // 1. The duration was genuinely zero.
    // 2. The duration was non-zero but less than 1 second (e.g., 500ms), 
    //    and all d,h,m,s components floored to 0.
    // In both scenarios, the desired output is "0s" based on existing tests.
    return '0s';
  }

  return result;
}; 