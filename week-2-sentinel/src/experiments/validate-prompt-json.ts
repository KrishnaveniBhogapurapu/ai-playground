import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseIncidentAnalysis } from '../validation/parse-incident-analysis.js';

const defaultResponsePath =
  './experiments/structured-output/prompt-requested-json-run-1-formatted.json';
const responsePath = resolve(process.argv[2] ?? defaultResponsePath);

try {
  const rawResponse = await readFile(responsePath, 'utf8');
  const analysis = parseIncidentAnalysis(rawResponse);

  console.log('Validation succeeded.');
  console.log(`File: ${responsePath}`);
  console.log(`Facts: ${analysis.facts.length}`);
  console.log(`Assumptions: ${analysis.assumptions.length}`);
  console.log(`Hypotheses: ${analysis.hypotheses.length}`);
  console.log(`Uncertainty: ${analysis.uncertainty.level}`);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown error.';
  console.error(`Validation failed: ${message}`);
  process.exitCode = 1;
}
