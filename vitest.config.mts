import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    // Files that render the admin opt into jsdom themselves.
    environment: 'node',
    // Files share one module graph, so Payload starts and syncs its schema once rather than per file.
    isolate: false,
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Every file shares the one test database.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    // The admin's packages import CSS files, which Node cannot load; bundled by Vite, they can.
    server: { deps: { inline: [/@payloadcms\//, /react-image-crop/] } },
  },
})
