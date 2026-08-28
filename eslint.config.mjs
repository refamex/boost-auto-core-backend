// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      ecmaVersion: 5,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn'
    },
  },
  {
    // `expect(repo.findAndCount)` hands the mock to a matcher; it never invokes
    // it, so there is no `this` to lose. typescript-eslint documents this as
    // unbound-method's known false positive under Jest and points at
    // eslint-plugin-jest's replacement rule, which this project does not
    // install. Scoped to specs so production code keeps the check.
    //
    // The no-unsafe-* rules stay ON here deliberately: those fire on genuinely
    // untyped query results, and silencing them is what let CI rot.
    files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
    rules: {
      '@typescript-eslint/unbound-method': 'off',
    },
  },
);