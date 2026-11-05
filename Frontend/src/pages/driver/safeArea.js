// Room for the phone's status bar (top) and gesture/navigation bar (bottom). In the Android app the page is drawn
// behind them and Capacitor passes their sizes as --safe-area-inset-*; in a browser these are 0.
export const SAFE_TOP = 'var(--safe-area-inset-top, env(safe-area-inset-top, 0px))';
export const SAFE_BOTTOM = 'var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))';
