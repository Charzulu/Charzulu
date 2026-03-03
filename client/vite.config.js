import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: path.resolve('./client'),
  server: {
    port: 5173,
    fs: { allow: [path.resolve('.')] }
  },
  resolve: {
    alias: {
      '@shared': path.resolve('./shared')
    }
  }
});
