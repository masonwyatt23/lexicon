import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { harvestRepo } from '../src/core/harvest.js';

// The `NOTE` marker is an exact uppercase literal in the generic identifier
// set (docs/harvest-markers.md), so it must behave the same whatever comment
// leader or line ending a language uses: never proposed, names beside it kept.
const FILES: Record<string, { text: string; name: string }> = {
  'go.go': { text: '// NOTE: OrbitRelay\r\n', name: 'OrbitRelay' },
  'swift.swift': { text: '// NOTE: PulsarLoader\n', name: 'PulsarLoader' },
  'rb.rb': { text: '# NOTE: VectorPlanner\n', name: 'VectorPlanner' },
  'rs.rs': { text: '/// NOTE: QuartzRouter\r\n', name: 'QuartzRouter' },
  'java.java': { text: '/* NOTE:\r\n * MeridianQueue\r\n */\r\n', name: 'MeridianQueue' },
  'jsx.jsx': { text: '{/* NOTE: SolarBridge */}\n', name: 'SolarBridge' },
};

describe('harvest NOTE marker across languages and line endings', () => {
  it('never proposes NOTE and keeps the adjacent name for every comment style', async () => {
    const base = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'lexicon-note-lang-')));
    const repo = path.join(base, 'repo');
    await fs.mkdir(repo);
    try {
      for (const [file, { text }] of Object.entries(FILES)) {
        await fs.writeFile(path.join(repo, file), text);
      }
      const names = (await harvestRepo(repo, { git: false, minCount: 1, symbols: true }))
        .map((c) => c.canonical);
      expect(names).not.toContain('NOTE');
      expect(names.sort()).toEqual(Object.values(FILES).map((f) => f.name).sort());
    } finally {
      await fs.rm(base, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
    }
  });
});
