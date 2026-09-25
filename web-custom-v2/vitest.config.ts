import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const currentDirectory = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(currentDirectory, './src'),
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
    /**
     * Above the 15s `asyncUtilTimeout` in the setup file. They have to be ordered that
     * way round: with vitest's 5s default the runner killed the test first, so a slow
     * `findBy*` on the heaviest page failed at 5s no matter what Testing Library was
     * told to wait, and a different test failed on each full run.
     */
    testTimeout: 20_000,
  },
})
