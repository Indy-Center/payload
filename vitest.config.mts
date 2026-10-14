import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['tests/int/**/*.int.spec.ts'],
    // Every file shares the one test database.
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
    // The admin's packages import CSS files, which Node cannot load; bundled by Vite, they can.
    server: { deps: { inline: [/@payloadcms\/(next|ui)/, /react-image-crop/] } },
  },
})
