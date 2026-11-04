import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Lexicon } from '../src/core/index.js';
import type { ExecResult, VoiceExec } from '../src/voice/process.js';
import { transcribeFile } from '../src/voice/transcribe.js';

// Contract: docs/CONTRACT.md, src/voice/transcribe.ts,
// docs/transcript-cleaning-scope.md. cleanTranscript drops every `[...]` tag
// and never joins the words it sat between; transcribeFile is the stage that
// runs it, so the tag must be gone from `raw` (and from `normalized.input`)
// with both surrounding spoken words still there. The cleanTranscript half of
// this lives in tests/clean-transcript-bracketed-tag.test.ts; this file
// exercises the transcribeFile half, which only
// tests/transcribe-empty-transcript.test.ts calls directly otherwise.
const LEXICON: Lexicon = {
  version: 1,
  terms: [
    { canonical: 'Ashlr.AI', aliases: ['Ashler'] },
    { canonical: 'Kubernetes', aliases: ['cooper netties'] },
  ],
};

interface FakeWhisper {
  /**
   * transcription[].text values whisper writes to `<outBase>.json`. undefined
   * writes no JSON at all, the way a whisper-cli that printed to stdout does.
   */
  segments?: string[];
  stdout?: string;
}

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await fs.rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

async function transcribe(whisper: FakeWhisper) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'lexicon-transcribe-tag-'));
  dirs.push(dir);
  // One second of 16 kHz mono s16 silence; only the size is read (wavSeconds).
  const wav = path.join(dir, 'capture.wav');
  await fs.writeFile(wav, Buffer.alloc(44 + 32_000));

  const execCalls: Array<{ cmd: string; args: string[] }> = [];
  const exec: VoiceExec = async (cmd, args): Promise<ExecResult> => {
    execCalls.push({ cmd, args: [...args] });
    const of = args[args.indexOf('-of') + 1];
    if (whisper.segments !== undefined) {
      await fs.writeFile(`${of}.json`, JSON.stringify({ transcription: whisper.segments.map((text) => ({ text })) }));
    }
    return { code: 0, stdout: whisper.stdout ?? '', stderr: '' };
  };

  const result = await transcribeFile(wav, {
    lexicon: LEXICON,
    whisperCli: '/fake/whisper-cli',
    modelOptions: { globalPath: path.join(dir, 'lexicon.yaml'), exists: () => true, fallbackDirs: [] },
    exec,
    tmpDir: path.join(dir, 'tmp'),
  });
  return { result, execCalls };
}

describe('transcribeFile bracketed tag between spoken words', () => {
  it.each([
    ['its own JSON segment', { segments: ['send', '[MUSIC]', 'report'] }],
    ['inside one JSON segment', { segments: ['send [MUSIC] report'] }],
    ['glued to both words', { segments: ['send[MUSIC]report'] }],
    ['glued to the first word', { segments: ['send[MUSIC] report'] }],
    ['glued to the second word', { segments: ['send [MUSIC]report'] }],
    ['a multi-word tag', { segments: ['send [background music playing] report'] }],
    ['an empty tag', { segments: ['send [] report'] }],
    ['a tag spanning a newline', { segments: ['send[one\ntwo]report'] }],
    ['the stdout fallback', { stdout: 'send [MUSIC] report' }],
    ['stdout with the tag glued to both words', { stdout: 'send[inaudible]report' }],
  ])('removes the tag and keeps both surrounding words in raw when it appears as %s', async (_label, whisper) => {
    const { result } = await transcribe(whisper);
    expect(result.raw).toBe('send report');
    expect(result.output).toBe('send report');
    expect(result.normalized.input).toBe('send report');
  });

  it('leaves a single space between the surrounding words, never joining them', async () => {
    const { result } = await transcribe({ segments: ['send[MUSIC]report'] });
    expect(result.raw).toBe('send report');
    expect(result.raw).not.toContain('sendreport');
  });

  it('never lets the tag text reach normalize', async () => {
    const { result } = await transcribe({ segments: ['send', '[BLANK_AUDIO]', 'report'] });
    expect(result.normalized.input).toBe('send report');
    expect(result.normalized.input).not.toContain('BLANK_AUDIO');
    expect(result.raw).not.toContain('[');
  });

  it('keeps both surrounding words through normalization, aliases included', async () => {
    const { result } = await transcribe({ segments: ['ping ashler [MUSIC] about cooper netties'] });
    expect(result.raw).toBe('ping ashler about cooper netties');
    expect(result.output).toBe('ping Ashlr.AI about Kubernetes');
    expect(result.normalized.replacements.map((x) => [x.original, x.replacement])).toEqual([
      ['ashler', 'Ashlr.AI'],
      ['cooper netties', 'Kubernetes'],
    ]);
  });

  it('still runs whisper-cli once on the capture', async () => {
    const { execCalls } = await transcribe({ segments: ['send [MUSIC] report'] });
    expect(execCalls).toHaveLength(1);
    expect(execCalls[0].cmd).toBe('/fake/whisper-cli');
    expect(execCalls[0].args).toEqual(expect.arrayContaining(['-l', 'en', '-nt', '-np', '-oj']));
  });
});
