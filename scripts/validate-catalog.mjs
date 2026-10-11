#!/usr/bin/env node

import { loadCatalogData, validateCatalogData } from './catalog-lib.mjs';
import { pathToFileURL } from 'node:url';

export async function validateCatalog() {
  const data = await loadCatalogData();
  return validateCatalogData(data);
}

async function main() {
  const result = await validateCatalog();
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`catalog error: ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `Validated ${result.entries.length} ACSL 1.24 catalog entries and ${result.snippets.length} snippets.`,
  );
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
