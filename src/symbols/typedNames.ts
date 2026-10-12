import type { AcslToken } from './acslTokens';

export interface AcslTypedName {
  readonly name: string;
  readonly typeText?: string;
  readonly declarationOffset: number;
}

export const ACSL_TYPE_WORDS = new Set([
  'void', 'char', 'short', 'int', 'long', 'float', 'double', 'signed', 'unsigned',
  'const', 'volatile', 'restrict', '_Bool', 'bool', 'integer', 'real', 'boolean',
  'struct', 'union', 'enum', 'logic', 'predicate', 'inductive',
]);

export function acslTokenText(tokens: readonly AcslToken[], start: number, end: number): string {
  return tokens.slice(start, end).map(({ text }) => text).join(' ')
    .replace(/\s+([[\]<>*,])/g, '$1').replace(/([<[])\s+/g, '$1');
}

export function findAcslAngleEnd(tokens: readonly AcslToken[], start: number, end: number): number {
  let depth = 0;
  for (let index = start; index < end; index += 1) {
    if (tokens[index]!.text === '<') depth += 1;
    if (tokens[index]!.text === '>' && --depth === 0) return index;
  }
  return start;
}

/** Shares typed-name spelling extraction between local binders and signatures. */
export function readAcslTypedNames(
  tokens: readonly AcslToken[], pairs: ReadonlyMap<number, number>, start: number, end: number,
): AcslTypedName[] {
  const text = (index: number) => tokens[index]?.text ?? '';
  const names: AcslTypedName[] = [];
  let segmentStart = start;
  let inheritedType: string | undefined;
  for (let index = start; index <= end; index += 1) {
    if (index < end && pairs.has(index)) {
      index = pairs.get(index)!;
      continue;
    }
    if (index < end && text(index) === '<') {
      index = findAcslAngleEnd(tokens, index, end);
      continue;
    }
    if (index < end && text(index) !== ',') continue;

    let nameIndex: number | undefined;
    for (let candidate = segmentStart; candidate < index; candidate += 1) {
      if (text(candidate) === '<') {
        candidate = findAcslAngleEnd(tokens, candidate, index);
        continue;
      }
      if (text(candidate) === '[') {
        candidate = pairs.get(candidate) ?? index;
        continue;
      }
      const token = tokens[candidate]!;
      if (token.kind === 'identifier' && !ACSL_TYPE_WORDS.has(token.text)) nameIndex = candidate;
      if (text(candidate) === '(' && text(candidate + 1) === '*') {
        const close = pairs.get(candidate);
        const pointerName = tokens[candidate + 2];
        if (close !== undefined && pointerName?.kind === 'identifier') {
          nameIndex = candidate + 2;
          break;
        }
      }
    }
    if (nameIndex !== undefined) {
      let validDeclaration = true;
      for (let part = segmentStart; part < index; part += 1) {
        if (pairs.has(part)) part = pairs.get(part)!;
        else if (text(part) === '<') {
          const close = findAcslAngleEnd(tokens, part, index);
          if (close === part) validDeclaration = false;
          else part = close;
        } else if (['+', '-', '/', '%', '?', '=', '!', '|', '&', '>'].includes(text(part))) {
          validDeclaration = false;
        }
      }
      if (!validDeclaration) {
        segmentStart = index + 1;
        continue;
      }
      const declaredType = acslTokenText(tokens, segmentStart, nameIndex);
      const pointerOnly = /^\*+$/.test(declaredType);
      const baseType = pointerOnly && inheritedType !== undefined
        ? `${inheritedType}${declaredType}`
        : declaredType || inheritedType;
      if (baseType !== undefined && baseType.length > 0) {
        // Retain declarator suffixes (arrays and function-pointer argument
        // types); only the declared name itself is omitted from its type.
        const suffix = acslTokenText(tokens, nameIndex + 1, index);
        const typeText = `${baseType}${suffix ? `${suffix.startsWith('[') || suffix.startsWith(')') ? '' : ' '}${suffix}` : ''}`;
        const token = tokens[nameIndex]!;
        names.push({ name: token.text, typeText, declarationOffset: token.start });
        if (declaredType && !pointerOnly) inheritedType = declaredType.replace(/\*+$/, '').trim();
      }
    }
    segmentStart = index + 1;
  }
  return names;
}
