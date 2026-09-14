import { requiredOption } from '../src/helpers/command-line.js';
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { runSdkInvestigation } from '../src/integrations/agent-sdk.js';
import { runCustomSdkInvestigation } from '../src/integrations/custom-decisions.js';
import { Investigation } from '../src/application/investigation.js';
import { investigationPrompt, injectionProvider } from '../fixtures/investigation.js';

const mode = process.argv[2] ?? 'sdk';
const directory = requiredOption(process.argv.slice(2), '--output-dir');
const started = new Date().toISOString();
let result: unknown;
if (mode === 'sdk' || mode === 'sdk-injection') {
  result = await runSdkInvestigation(investigationPrompt,
    new Investigation(mode === 'sdk-injection' ? { provider: injectionProvider } : {}));
} else if (mode === 'custom' || mode === 'custom-injection') {
  result = await runCustomSdkInvestigation(investigationPrompt,
    new Investigation(mode === 'custom-injection' ? { provider: injectionProvider } : {}));
} else throw new Error('Use sdk, sdk-injection, custom, or custom-injection.');
await mkdir(directory, { recursive: true });
const path = `${directory}/${mode}-${started.replaceAll(':', '-')}.json`;
await writeFile(path, JSON.stringify({ evidence_kind: 'live-model-attempt', started_at: started, mode, result }, null, 2));
console.log(JSON.stringify({ saved: path, accepted: (result as { accepted: boolean }).accepted }, null, 2));
if (!(result as { accepted: boolean }).accepted) process.exitCode = 1;
