// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import dns from 'dns';

// Set DNS resolution order to prioritize IPv4
dns.setDefaultResultOrder('ipv4first');

export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // Listen on all network interfaces
    port: 3000,
    strictPort: true, // Don't try other ports if 3000 is taken
    https: {
      key: fs.readFileSync('certs/localhost.key'),
      cert: fs.readFileSync('certs/localhost.crt'),
    },
    open: true // Open browser when server starts
  }
});