const AI_ATTRIBUTION = [
  /co-authored-by:[^\n]*(claude|anthropic)/i,
  /generated (with|by)\s+\[?claude/i,
  /noreply@anthropic\.com/i,
]

/** @type {import('@commitlint/types').UserConfig} */
const config = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'no-ai-attribution': (parsed) => {
          const raw = parsed.raw ?? ''
          const hit = AI_ATTRIBUTION.some((re) => re.test(raw))
          return [
            !hit,
            'remove AI attribution lines (Co-Authored-By Claude/Anthropic, "Generated with Claude Code")',
          ]
        },
      },
    },
  ],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'chore', 'docs', 'test', 'refactor', 'style', 'perf', 'ci', 'build', 'revert'],
    ],
    'no-ai-attribution': [2, 'always'],
  },
}

export default config
