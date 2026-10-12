import { describe, expect, it } from 'vitest';

import { scanAcslContext } from '../../src/context/acslContext';
import { collectAcslLocalSymbols } from '../../src/symbols/localSymbols';
import { indexAcslDocumentSymbols, visibleAcslDocumentSymbols } from '../../src/symbols/documentSymbols';

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

  it('collects local names in a 1 MiB document within the editing budget', () => {
    const line = 'int value = 0; /* ordinary comment */\n';
    const repetitions = Math.ceil((1024 * 1024) / line.length);
    const source = `${line.repeat(repetitions)}/*@ predicate p(integer value) = \\forall integer index; value > index;`;
    const cursor = source.length - 1;
    const collect = () => {
      const context = scanAcslContext(source, cursor)!;
      return collectAcslLocalSymbols(source, context);
    };
    expect(collect().map(({ name }) => name).sort()).toEqual(['index', 'value']);
    const samples = Array.from({ length: 5 }, () => {
      const start = performance.now();
      collect();
      return performance.now() - start;
    }).sort((left, right) => left - right);
    expect(samples[Math.floor(samples.length / 2)]!).toBeLessThan(20);
  });

  it('indexes document references and local bindings in a 1 MiB editing buffer', () => {
    const line = 'int value = 0; /* ordinary comment */\n';
    const source = `/*@ logic integer twice(integer value) = value * 2; */\n${line.repeat(Math.ceil(1024 * 1024 / line.length))}/*@ predicate positive(integer value) = twice(value) > 0; ensures tw`;
    const collect = () => {
      const context = scanAcslContext(source, source.length)!;
      const index = indexAcslDocumentSymbols(source);
      collectAcslLocalSymbols(source, context);
      return visibleAcslDocumentSymbols(index, context);
    };
    expect(collect().map(({ name }) => name)).toEqual(['positive', 'twice']);
    const samples = Array.from({ length: 5 }, () => {
      const startedAt = performance.now();
      collect();
      return performance.now() - startedAt;
    }).sort((left, right) => left - right);
    expect(samples[Math.floor(samples.length / 2)]!).toBeLessThan(20);
  });
});
