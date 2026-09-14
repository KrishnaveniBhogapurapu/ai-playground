import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { runSdkInvestigation } from '../runtime/sdk-investigation.js';
import { Investigation } from '../runtime/investigation.js';
import { investigationPrompt, injectionProvider } from './week3-fixtures.js';

const mode = process.argv[2] ?? 'sdk';
const started = new Date().toISOString();
let result: unknown;
if (mode === 'sdk' || mode === 'sdk-injection') {
  result = await runSdkInvestigation(investigationPrompt,
    new Investigation(mode === 'sdk-injection' ? { provider: injectionProvider } : {}));
} else throw new Error('Use sdk or sdk-injection.');
const directory = 'experiments/week-3/runs';
await mkdir(directory, { recursive: true });
const path = `${directory}/${mode}-${started.replaceAll(':', '-')}.json`;
await writeFile(path, JSON.stringify({ evidence_kind: 'live-model-attempt', started_at: started, mode, result }, null, 2));
console.log(JSON.stringify({ saved: path, accepted: (result as { accepted: boolean }).accepted }, null, 2));
if (!(result as { accepted: boolean }).accepted) process.exitCode = 1;
