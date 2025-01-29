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

function createModelParamsStreaming(
    userPrompt: string
): Anthropic.MessageCreateParamsStreaming {
    return {
        messages: createMessages(userPrompt),
        stream: true,
        ...claudeModel,
    };
}

function createMessages(userPrompt: string): Anthropic.MessageParam[] {
    return [{ role: 'user', content: userPrompt }];
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
                    .stream(createModelParamsStreaming(concatenatedContent))
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
        async provideTokenCount(text) {
            if (!anthropic) {
                throw new Error('Anthropic client is not initialized.');
            }

            const prompt = typeof text === 'string' ? text : text.content;

            const response = await anthropic.messages.countTokens({
                messages: createMessages(prompt),
                model: claudeModel.model,
            });
            if (!response) {
                throw new Error('Failed to count tokens.');
            }

            return response.input_tokens;
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
                .stream(createModelParamsStreaming(request.prompt))
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
