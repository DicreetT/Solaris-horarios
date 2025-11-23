/**
 * Time calculation utilities
 */

/**
 * Calculate hours between two time strings
 * @param {string} entry - Entry time in "HH:MM" format
 * @param {string} exit - Exit time in "HH:MM" format
 * @returns {number} Decimal hours (e.g., 8.5 for 8 hours 30 minutes)
 */
export function calculateHours(entry: string | null, exit: string | null): number {
    if (!entry || !exit) return 0;

    try {
        const [entryHours, entryMinutes] = entry.split(':').map(Number);
        const [exitHours, exitMinutes] = exit.split(':').map(Number);

        const entryTotalMinutes = entryHours * 60 + entryMinutes;
        let exitTotalMinutes = exitHours * 60 + exitMinutes;

        // Handle overnight shifts
        if (exitTotalMinutes < entryTotalMinutes) {
            exitTotalMinutes += 24 * 60;
        }

        const totalMinutes = exitTotalMinutes - entryTotalMinutes;
        return totalMinutes / 60;
    } catch (e) {
        console.error('Error calculating hours:', e);
        return 0;
    }
}

/**
 * Format decimal hours to readable string
 * @param {number} hours - Decimal hours
 * @returns {string} Formatted string (e.g., "8.5h" or "8h 30m")
 */
export function formatHours(hours: number): string {
    const wholehours = Math.floor(hours);
    const minutes = Math.round((hours - wholehours) * 60);

    if (minutes === 0) {
        return `${wholehours}h`;
    }
    return `${wholehours}h ${minutes}m`;
}

/**
 * Calculate total hours from multiple time entries
 * @param {Array} entries - Array of time entry objects with entry and exit
 * @returns {number} Total decimal hours
 */
export function calculateTotalHours(entries: Array<{ entry: string | null; exit: string | null }>): number {
    if (!entries || entries.length === 0) return 0;

    return entries.reduce((total, entry) => {
        return total + calculateHours(entry.entry, entry.exit);
    }, 0);
}
