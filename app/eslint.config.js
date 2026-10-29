// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // *.test.ts run under Deno (deno test / deno lint), not the app toolchain.
    ignores: ['dist/*', '**/*.test.ts'],
  },
]);
