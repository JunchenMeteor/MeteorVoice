import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@meteorvoice/api-client': path.resolve(__dirname, 'packages/api-client/src/index.ts'),
      '@meteorvoice/api-client/types': path.resolve(__dirname, 'packages/api-client/src/types.ts'),
      '@meteorvoice/session-core': path.resolve(__dirname, 'packages/session-core/src/index.ts'),
      '@meteorvoice/session-core/turn-guard': path.resolve(__dirname, 'packages/session-core/src/turn-guard.ts'),
      '@meteorvoice/session-core/workflow': path.resolve(__dirname, 'packages/session-core/src/workflow.ts'),
      '@meteorvoice/shared': path.resolve(__dirname, 'packages/shared/src/index.ts'),
      '@meteorvoice/shared/conversation': path.resolve(__dirname, 'packages/shared/src/conversation.ts'),
      '@meteorvoice/shared/locale': path.resolve(__dirname, 'packages/shared/src/locale.ts'),
      '@meteorvoice/shared/scenarios': path.resolve(__dirname, 'packages/shared/src/scenarios.ts'),
      '@meteorvoice/shared/speech': path.resolve(__dirname, 'packages/shared/src/speech.ts'),
      '@': path.resolve(__dirname),
    },
  },
})
