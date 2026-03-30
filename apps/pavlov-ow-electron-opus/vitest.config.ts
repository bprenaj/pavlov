import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/renderer/**',
        'src/main/preload.ts',
        'src/main/overlayPreload.ts',
        'src/main/services/beamBridge.ts',
        'src/main/services/tray.ts',
      ],
    },
  },
});
