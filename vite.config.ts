import { defineConfig } from 'vite';

// GitHub Pages serves the site at https://isparkzx.github.io/New-Era-Feedback-Board/
export default defineConfig({
  base: '/New-Era-Feedback-Board/',
  build: { target: 'es2022' },
  // Sign-in links redirect to localhost:5173, so don't drift to another port.
  server: { port: 5173, strictPort: true },
  preview: { port: 5173, strictPort: true },
});
