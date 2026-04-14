import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['server/**/__tests__/**/*.test.{ts,js}'],
    exclude: ['**/node_modules/**'],
  },
})
