import * as vscode from 'vscode';
import { Anthropic } from '@anthropic-ai/sdk'; // Import Anthropic SDK

const CLAUDE_PARTICIPANT_ID = 'cpulvermacher.claude';

// See https://docs.anthropic.com/en/docs/about-claude/models
const claudeModel = {
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 8192,
};

interface IClaudeChatResult extends vscode.ChatResult {
    metadata: {
        command: string;
    };
}

function createModelParams(
    userPrompt: string,
    stream?: boolean
): Anthropic.MessageStreamParams {
    return {
        messages: [{ role: 'user', content: userPrompt }],
        stream: stream ?? false,
        ...claudeModel,
    };
}

const logger = vscode.env.createTelemetryLogger({
    sendEventData(eventName, data) {
        // Capture event telemetry
        console.log(`Event: ${eventName}`);
        console.log(`Data: ${JSON.stringify(data)}`);
    },
    sendErrorData(error, data) {
        // Capture error telemetry
        console.error(`Error: ${error}`);
        console.error(`Data: ${JSON.stringify(data)}`);
    },
});

let anthropic: Anthropic | undefined;

async function initAnthropicClient(context: vscode.ExtensionContext) {
    if (!anthropic) {
        let apiKey = await context.secrets.get('claude.apiKey');
        if (!apiKey) {
            apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your Anthropic API Key',
                ignoreFocusOut: true,
            });

            if (!apiKey) {
                throw new Error('API Key is required');
            }

            await context.secrets.store('claude.apiKey', apiKey);
        }
        anthropic = new Anthropic({
            apiKey,
        });
    }
}

export async function activate(context: vscode.ExtensionContext) {
    await initAnthropicClient(context);

    const claude = vscode.chat.createChatParticipant(
        CLAUDE_PARTICIPANT_ID,
        handler
    );
    claude.iconPath = vscode.Uri.joinPath(
        context.extensionUri,
        'anthropic-icon.png'
    ); // Update icon if needed

    // Register Language Model Provider
    const languageModelProvider: vscode.LanguageModelChatProvider = {
        async provideLanguageModelResponse(
            messages,
            options,
            extensionId,
            progress
        ) {
            await new Promise((resolve, reject) => {
                if (!anthropic) {
                    reject(new Error('Anthropic client is not initialized.'));
                    return;
                }

                const concatenatedContent = messages
                    .map((msg) => msg.content)
                    .join(' ');
                anthropic.messages
                    .stream(createModelParams(concatenatedContent, true))
                    .on('text', (text) => {
                        progress.report({ index: 0, part: text });
                    })
                    .on('error', (err) => {
                        reject(err);
                    })
                    .on('finalMessage', () => {
                        resolve('');
                    });
            });
        },
        provideTokenCount(text) {
            if (typeof text === 'string') {
                return Promise.resolve(text.length); // Simplified token count for string
            } else {
                const message = text as vscode.LanguageModelChatMessage;
                return Promise.resolve(message.content.length); // Simplified token count for LanguageModelChatMessage
            }
        },
    };

    const metadata: vscode.ChatResponseProviderMetadata = {
        vendor: 'Anthropic',
        name: 'Claude',
        family: 'claude',
        version: '3.5',
        maxInputTokens: 200000,
        maxOutputTokens: claudeModel.max_tokens,
    };

    context.subscriptions.push(
        vscode.lm.registerChatModelProvider(
            'anthropic.claude',
            languageModelProvider,
            metadata
        )
    );
    vscode.lm.selectChatModels({ vendor: 'Anthropic' }).then((models) => {
        console.log(`Selected models: ${JSON.stringify(models)}`);
    });
    context.subscriptions.push(claude);
}

async function handler(
    request: vscode.ChatRequest,
    context: vscode.ChatContext,
    stream: vscode.ChatResponseStream
): Promise<IClaudeChatResult> {
    try {
        return await new Promise<IClaudeChatResult>((resolve, reject) => {
            anthropic!.messages
                .stream(createModelParams(request.prompt, true))
                .on('text', (text) => {
                    stream.markdown(text);
                })
                .on('error', (err) => {
                    handleError(logger, err, stream);
                    reject(err);
                })
                .on('finalMessage', () => {
                    resolve({ metadata: { command: 'claude_chat' } });
                });
        });
    } catch (err) {
        handleError(logger, err, stream);
    }

    logger.logUsage('request', { kind: 'claude' });
    return { metadata: { command: 'claude_chat' } };
}

function handleError(
    logger: vscode.TelemetryLogger,
    err: unknown,
    stream: vscode.ChatResponseStream
): void {
    if (err instanceof Error) {
        logger.logError(err);
        console.error(err.message);
        stream.markdown(`An error occurred: ${err.message}`);
    } else {
        console.error('An unknown error occurred');
        stream.markdown('An unknown error occurred');
    }
}

export function deactivate() {}
