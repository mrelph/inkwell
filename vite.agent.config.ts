import { defineConfig } from 'vite'

// Arch packages only the compiled trees. Bundle the ACP runtime alongside main.
export default defineConfig({
  build: {
    target: 'node22',
    outDir: 'dist-electron',
    emptyOutDir: false,
    lib: { entry: 'src-electron/agentRuntime.ts', formats: ['cjs'], fileName: () => 'agent-runtime.cjs' }
  }
})
