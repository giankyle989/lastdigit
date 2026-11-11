import { FlatCompat } from '@eslint/eslintrc'
import prettier from 'eslint-config-prettier'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import { dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const compat = new FlatCompat({ baseDirectory: __dirname })

/** One `@typescript-eslint/no-restricted-imports` rule per layer (spec §2.2). Later blocks override earlier ones. */
function restrict(files, groups, message, ignores = []) {
  return {
    files,
    ignores,
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: groups.map(({ group, allowTypeImports = false }) => ({
            group,
            allowTypeImports,
            message,
          })),
        },
      ],
    },
  }
}

const NEXT_REACT = [{ group: ['next', 'next/*'] }, { group: ['react', 'react-dom', 'react/*'] }]
const UI = [{ group: ['@/app/*', '@/components/*'] }]

const eslintConfig = [
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'build/**',
      'next-env.d.ts',
      'prisma/migrations/**',
      'test-results/**',
      'playwright-report/**',
      '.superpowers/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  // Layer boundaries (spec §2.2)
  restrict(
    ['src/lib/**/*.{ts,tsx}'],
    [
      ...NEXT_REACT,
      ...UI,
      { group: ['@/server/*'] },
      { group: ['@/lib/db', '**/lib/db'] },
      { group: ['@prisma/client'], allowTypeImports: true },
    ],
    'src/lib must stay pure: no database, Next.js, React, server or UI imports (Prisma types only).',
    ['src/lib/db.ts'],
  ),
  restrict(
    ['src/server/**/*.{ts,tsx}'],
    [...NEXT_REACT, ...UI],
    'src/server holds domain logic: no Next.js, React or UI imports (only session.ts may use next/navigation).',
    ['src/server/session.ts'],
  ),
  restrict(
    ['src/server/session.ts'],
    [{ group: ['react', 'react-dom', 'react/*'] }, ...UI],
    'session.ts may use next/navigation and @/auth only.',
  ),
  restrict(
    ['src/app/**/*.{ts,tsx}'],
    [{ group: ['@/lib/db', '**/lib/db'] }],
    'src/app must not touch the database directly: call a src/server function.',
  ),
  restrict(
    ['src/components/**/*.{ts,tsx}'],
    [{ group: ['@/lib/db', '**/lib/db'] }, { group: ['@/server/*'] }],
    'src/components must not import the database or src/server: pass data in as props or call an action.',
  ),
  prettier,
]

export default eslintConfig
