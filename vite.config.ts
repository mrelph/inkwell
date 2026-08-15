import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative asset paths are required: Electron loads the built index.html over
  // file://, where absolute "/assets/..." URLs resolve to the filesystem root.
  base: './',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
