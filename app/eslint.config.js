// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// Illustrations are local react-native-svg components only: nothing loads SVG from a URL or a file
// at runtime (docs/design/decisions.md).
const REMOTE_SVG = 'Illustrations are local react-native-svg components; no remote or file-loaded SVG.';

module.exports = defineConfig([
  expoConfig,
  {
    // *.test.ts run under Deno (deno test / deno lint), not the app toolchain.
    ignores: ['dist/*', '**/*.test.ts'],
  },
  {
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native-svg',
              importNames: ['SvgUri', 'SvgCssUri', 'SvgFromUri', 'LocalSvg', 'SvgCss', 'WithLocalSvg'],
              message: REMOTE_SVG,
            },
            {
              name: 'react-native-svg/css',
              message: REMOTE_SVG,
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name=/^(href|xlinkHref)$/][value.value=/^\\s*(https?:)?\\/\\//i]',
          message: `${REMOTE_SVG} No remote href/xlinkHref.`,
        },
        {
          selector:
            'JSXAttribute[name.name=/^(href|xlinkHref)$/] > JSXExpressionContainer > Literal[value=/^\\s*(https?:)?\\/\\//i]',
          message: `${REMOTE_SVG} No remote href/xlinkHref.`,
        },
        {
          selector:
            'JSXAttribute[name.name=/^(href|xlinkHref)$/] > JSXExpressionContainer > TemplateLiteral > TemplateElement[value.raw=/^\\s*(https?:)?\\/\\//i]',
          message: `${REMOTE_SVG} No remote href/xlinkHref.`,
        },
      ],
    },
  },
]);
