import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseIncidentAnalysis } from '../src/validation/incident-analysis.js';

const requestedPath = process.argv[2];
if (!requestedPath) throw new Error('Pass the path of a recorded analysis to validate.');
const responsePath = resolve(requestedPath);

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
