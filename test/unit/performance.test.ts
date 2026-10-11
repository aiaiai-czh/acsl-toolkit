import { describe, expect, it } from 'vitest';

import { scanAcslContext } from '../../src/context/acslContext';

describe('context scanner performance', () => {
  it('scans a 1 MiB editing buffer within the preview performance budget', () => {
    const line = 'int value = 0; /* ordinary comment */\n';
    const repetitions = Math.ceil((1024 * 1024) / line.length);
    const source = `${line.repeat(repetitions)}/*@ requires value > 0;`;
    const cursorOffset = source.length;

    // Warm up the JIT before measuring several complete forward scans.
    expect(scanAcslContext(source, cursorOffset)?.kind).toBe('block');

    const samples = Array.from({ length: 5 }, () => {
      const startedAt = performance.now();
      expect(scanAcslContext(source, cursorOffset)?.kind).toBe('block');
      return performance.now() - startedAt;
    }).sort((left, right) => left - right);

    const median = samples[Math.floor(samples.length / 2)];
    expect(median).toBeDefined();
    expect(median!).toBeLessThan(20);
  });
});
