import 'dotenv/config';
import { startCli } from './cli/session.js';
import { formatFailure } from './errors/sentinel-failure.js';

startCli().catch((error: unknown) => {
  console.error(formatFailure(error));
  process.exitCode = 1;
});
