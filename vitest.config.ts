import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    environmentMatchGlobs: [
      ['server/**', 'node'],
      ['client/**', 'jsdom'],
    ],
    include: [
      'server/**/__tests__/**/*.test.{ts,js}',
      'client/**/__tests__/**/*.test.{ts,tsx}',
    ],
    exclude: ['**/node_modules/**'],
  },
})
