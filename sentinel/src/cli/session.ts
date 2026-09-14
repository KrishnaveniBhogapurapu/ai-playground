import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { readReasoningConfig } from '../config/reasoning.js';
import { formatFailure, SentinelFailure } from '../errors/sentinel-failure.js';
import type { AnalysisContract, TurnResponseMode } from '../inputs/analysis.js';
import { createImagePrompt } from '../inputs/image.js';
import { createIncidentAnalysisPrompt, createMultimodalIncidentAnalysisPrompt } from '../prompts/incident-analysis.js';
import { runTurn } from './analysis-turn.js';

export async function startCli(): Promise<void> {
  const reasoningConfig = readReasoningConfig(process.argv.slice(2));
  const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim();

  if (!oauthToken) {
    throw new SentinelFailure(
      'missing-configuration',
      'CLAUDE_CODE_OAUTH_TOKEN is not configured.',
    );
  }

  const terminal = createInterface({ input, output });
  let responseMode: TurnResponseMode = 'complete';
  let activeAbortController: AbortController | undefined;
  let exitRequested = false;

  terminal.on('SIGINT', () => {
    if (activeAbortController && !activeAbortController.signal.aborted) {
      output.write('\nCancelling current request...\n');
      activeAbortController.abort();
      return;
    }

    exitRequested = true;
    output.write('\nExiting Sentinel CLI.\n');
    terminal.close();
  });

  const runActiveTurn = async (
    prompt: string | AsyncIterable<SDKUserMessage>,
    analysisContract: AnalysisContract = 'text',
  ): Promise<void> => {
    const abortController = new AbortController();
    activeAbortController = abortController;

    try {
      await runTurn(
        prompt,
        reasoningConfig,
        responseMode,
        analysisContract,
        abortController,
      );
    } finally {
      if (activeAbortController === abortController) {
        activeAbortController = undefined;
      }
    }
  };

  console.log('Sentinel CLI');
  console.log(`Reasoning mode: ${reasoningConfig.mode}`);
  console.log('Enter a message, /image to send an image, or /exit to quit.');
  console.log('Use /mode complete or /mode stream to change response display.');
  console.log('Every incident analysis is parsed and schema-validated.');
  console.log('Prompt caching is automatic for the stable system contract.');
  console.log(
    'Read-only service metrics and dependency health tools are available when needed.',
  );
  console.log(
    'Complete mode waits for the Agent SDK final result; it is not a raw non-streaming Messages API request.\n',
  );

  try {
    while (!exitRequested) {
      const userInput = (await terminal.question('You: ')).trim();

      if (!userInput) {
        continue;
      }

      if (['/exit', 'exit', 'quit'].includes(userInput.toLowerCase())) {
        break;
      }

      if (userInput.toLowerCase().startsWith('/mode')) {
        const requestedMode = userInput.toLowerCase().split(/\s+/)[1];

        if (requestedMode === 'complete' || requestedMode === 'stream') {
          responseMode = requestedMode;
          console.log(`Response mode: ${responseMode}\n`);
        } else {
          console.log(
            `Current mode: ${responseMode}. Use /mode complete or /mode stream.\n`,
          );
        }

        continue;
      }

      try {
        if (userInput.toLowerCase() === '/image') {
          const imagePath = (await terminal.question('Image path: ')).trim();
          const incidentText = (
            await terminal.question('Incident text: ')
          ).trim();

          if (!imagePath) {
            throw new SentinelFailure(
              'invalid-input',
              'An image path is required.',
            );
          }

          if (!incidentText) {
            throw new SentinelFailure(
              'invalid-input',
              'Incident text is required with the dashboard image.',
            );
          }

          await runActiveTurn(
            createImagePrompt(
              imagePath,
              createMultimodalIncidentAnalysisPrompt(incidentText),
            ),
            'multimodal',
          );
          continue;
        }

        await runActiveTurn(createIncidentAnalysisPrompt(userInput));
      } catch (error: unknown) {
        console.error(`\n${formatFailure(error)}\n`);

        if (exitRequested) {
          break;
        }
      }
    }
  } catch (error: unknown) {
    if (!exitRequested) {
      throw error;
    }
  } finally {
    terminal.close();
  }
}
