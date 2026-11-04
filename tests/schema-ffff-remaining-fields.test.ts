import { describe, expect, it } from 'vitest';
import { TermSchema, UNENCODABLE_NOTE } from '../src/core/schema.js';

const reason = `must not contain U+FFFF (${UNENCODABLE_NOTE}) in term "Ashlr.AI"`;

// The other U+FFFF tests cover canonical, aliases and notes; these are the
// remaining free-text fields the term-level check walks.
const CASES: ReadonlyArray<readonly [string, Record<string, unknown>, (string | number)[]]> = [
  ['never entry', { never: ['Fine', 'Ash￿ler'] }, ['never', 1]],
  ['phonetic', { phonetic: 'ash￿ler' }, ['phonetic']],
  ['createdAt', { createdAt: '2026-01-01￿' }, ['createdAt']],
];

describe('U+FFFF in the remaining term fields', () => {
  it.each(CASES)('rejects U+FFFF in %s and reports the code point', (_label, extra, path) => {
    const result = TermSchema.safeParse({ canonical: 'Ashlr.AI', ...extra });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Expected U+FFFF to be rejected');
    const issue = result.error.issues.find((i) => i.message.includes('U+FFFF'));
    expect(issue?.path).toEqual(path);
    expect(issue?.message).toBe(reason);
  });
});
