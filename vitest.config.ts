import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@meteorvoice/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@meteorvoice/shared/conversation': path.resolve(__dirname, 'packages/shared/src/conversation.ts'),
      '@meteorvoice/shared/locale': path.resolve(__dirname, 'packages/shared/src/locale.ts'),
      '@meteorvoice/shared/scenarios': path.resolve(__dirname, 'packages/shared/src/scenarios.ts'),
      '@meteorvoice/shared/speech': path.resolve(__dirname, 'packages/shared/src/speech.ts'),
      '@': path.resolve(__dirname),
    },
  },
})
