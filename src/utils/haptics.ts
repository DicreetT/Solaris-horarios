/**
 * Utility for haptic feedback
 * Uses the Web Vibration API if supported
 */

export const haptics = {
    /**
     * Small, subtle vibration for normal clicks/toggles
     */
    light: () => {
        if ('vibrate' in navigator) {
            navigator.vibrate(10);
        }
    },

    /**
     * More distinct vibration for success or important actions
     */
    medium: () => {
        if ('vibrate' in navigator) {
            navigator.vibrate(20);
        }
    },

    /**
     * Double vibration for errors or warnings
     */
    error: () => {
        if ('vibrate' in navigator) {
            navigator.vibrate([30, 50, 30]);
        }
    },

    /**
     * Long vibration for critical actions
     */
    heavy: () => {
        if ('vibrate' in navigator) {
            navigator.vibrate(50);
        }
    }
};
