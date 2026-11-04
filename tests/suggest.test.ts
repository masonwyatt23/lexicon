import { describe, expect, it } from 'vitest';
import { LIMITS } from '../src/core/caps.js';
import { suggestAliases } from '../src/core/suggest.js';

describe('suggestAliases', () => {
  it('suggests the headline Ashlr.AI misspellings', () => {
    const out = suggestAliases('Ashlr.AI');
    expect(out).toEqual(expect.arrayContaining(['Ashler', 'Ashlar', 'Ashlr AI']));
    expect(out).toContain('Ashlr');
  });

  it('splits camelCase', () => {
    expect(suggestAliases('OpenClaw')).toContain('Open Claw');
    expect(suggestAliases('PostgreSQL')).toContain('Postgre SQL');
  });

  // Catches: a guess that is an everyday word ("Entire.io" -> "Entire",
  // "Flyy" -> "Fly") became an alias, so "birds fly over the entire field"
  // was rewritten to "birds Flyy over the Entire.io field".
  it('never suggests a single everyday word, but keeps an acronym said as one', () => {
    expect(suggestAliases('Entire.io')).not.toContain('Entire');
    expect(suggestAliases('Entire.io')).toContain('Entire io');
    expect(suggestAliases('Flyy')).not.toContain('Fly');
    expect(suggestAliases('Ashlr.AI')).toContain('Ashlr');
    expect(suggestAliases('SaaS')).toContain('sass');
  });

  it('handles acronyms: pronounced and spelled forms', () => {
    const out = suggestAliases('SaaS');
    expect(out).toContain('sass');
    expect(out).toContain('S a a S');
    expect(out[0]).not.toBe('Saa S');
  });

  it('applies common phoneme confusions', () => {
    expect(suggestAliases('Kubernetes')).toContain('Cubernetes');
    expect(suggestAliases('Pydantic')).toEqual(expect.arrayContaining(['Pidantic', 'Pydantik']));
    expect(suggestAliases('Phanto')).toContain('Fanto');
    expect(suggestAliases('Hassler')).toContain('Hasler');
  });

  it('is deterministic, capped at 8, unique, and never returns the canonical or empties', () => {
    for (const c of ['Ashlr.AI', 'OpenClaw', 'SaaS', 'Kubernetes', 'Pydantic', 'Hetzner', 'Anthropic', 'Cloudflare-Workers', 'x']) {
      const a = suggestAliases(c);
      const b = suggestAliases(c);
      expect(a).toEqual(b);
      expect(a.length).toBeLessThanOrEqual(8);
      expect(new Set(a.map((s) => s.toLowerCase())).size).toBe(a.length);
      expect(a.map((s) => s.toLowerCase())).not.toContain(c.toLowerCase());
      for (const s of a) expect(s.trim().length).toBeGreaterThan(0);
    }
  });

  it('returns an empty list for blank input', () => {
    expect(suggestAliases('')).toEqual([]);
    expect(suggestAliases('   ')).toEqual([]);
  });

  // Catches: a suggestion over the schema's word limit (a vowel inserted into
  // a canonical already at the limit) was handed to addTerm as a generated
  // alias, so `lexicon add` refused a canonical that was legal on its own.
  it('never suggests an alias over the documented word limit', () => {
    // 80 characters ending in a >=3-consonant cluster: vowel insertion adds one.
    const canonical = `${'a'.repeat(LIMITS.word - 5)}bcdfg`;
    expect(canonical).toHaveLength(LIMITS.word);
    const out = suggestAliases(canonical);
    // The insertion lands before the last consonant: 'bcdf' + 'e' + 'g' (81 chars).
    expect(out).not.toContain(`${'a'.repeat(LIMITS.word - 5)}bcdfeg`);
    for (const s of out) expect(Array.from(s).length).toBeLessThanOrEqual(LIMITS.word);
    // One shorter, the same insertion fits and is still offered.
    const fits = suggestAliases(`${'a'.repeat(LIMITS.word - 6)}bcdfg`);
    expect(fits).toContain(`${'a'.repeat(LIMITS.word - 6)}bcdfeg`);
  });
});

describe('suggestAliases soft c', () => {
  it('suggests the s spelling STT writes for a soft c (GET /aliases?canonical=Vercel was empty)', () => {
    expect(suggestAliases('Vercel')).toContain('Versel');
    expect(suggestAliases('Mercedes')).toContain('Mersedes');
  });

  it('never suggests an everyday word that would then be rewritten everywhere', () => {
    expect(suggestAliases('Cell')).not.toContain('Sell');
    expect(suggestAliases('Cite')).not.toContain('Site');
    expect(suggestAliases('Science')).not.toContain('Sience');
  });
});
