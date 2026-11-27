// Builds only the login + Attendance Kiosk into AttendanceApp/www for the Android app (Capacitor).
//   npm run build:kiosk
// Its default server address comes from .env.kiosk (VITE_APP_SERVER); it can be changed in the app.
// The face models (public/face-models) go into the app, so it doesn't download them from the server.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Paths below are relative to Frontend/, whichever folder the command runs from
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  base: './',
  build: {
    outDir: '../AttendanceApp/www',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: { input: fileURLToPath(new URL('./kiosk.html', import.meta.url)) },
  },
});
