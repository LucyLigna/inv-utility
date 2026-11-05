// Builds only the driver delivery page into DriverApp/www for the Android app (Capacitor).
//   npm run build:driver
// Its default server address comes from .env.driver (VITE_DRIVER_SERVER); the driver can change it in the app.
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Paths below are relative to Frontend/, whichever folder the command runs from
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  base: './',
  publicDir: false, // public/ holds the IIS web.config, not needed in the app
  build: {
    outDir: '../DriverApp/www',
    emptyOutDir: true,
    rollupOptions: { input: fileURLToPath(new URL('./driver.html', import.meta.url)) },
  },
});
