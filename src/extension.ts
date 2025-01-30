import * as vscode from 'vscode';
import { Anthropic } from '@anthropic-ai/sdk'; // Import Anthropic SDK

const CLAUDE_PARTICIPANT_ID = 'cpulvermacher.claude';

// See https://docs.anthropic.com/en/docs/about-claude/models
const claudeModel = {
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 8192,
};
const maxInputTokens = 200000;
const chatResponseProviderMetadata: vscode.ChatResponseProviderMetadata = {
    vendor: 'Anthropic',
    name: 'Claude',
    family: 'claude',
    version: '3.5',
    maxInputTokens: maxInputTokens,
    maxOutputTokens: claudeModel.max_tokens,
};

interface IClaudeChatResult extends vscode.ChatResult {
    metadata: {
        command: string;
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
    context.subscriptions.push(claude);

    context.subscriptions.push(
        vscode.lm.registerChatModelProvider(
            'anthropic.claude',
            languageModelProvider,
            chatResponseProviderMetadata
        )
    );
    vscode.lm.selectChatModels({ vendor: 'Anthropic' }).then((models) => {
        console.log(`Selected models: ${JSON.stringify(models)}`);
    });
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

            const concatenatedContent = createPromptString(messages);
            if (concatenatedContent.length === 0) {
                resolve('');
                return;
            }
            anthropic.messages
                .stream(createModelParamsStreaming(concatenatedContent))
                .on('text', (text) => {
                    const textPart = new vscode.LanguageModelTextPart(text);
                    progress.report({ index: 0, part: textPart });
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

        const prompt = createPromptString(text);

        if (prompt.length === 0) {
            return 0;
        }

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

function createPromptString(
    messages:
        | string
        | vscode.LanguageModelChatMessage
        | vscode.LanguageModelChatMessage[]
): string {
    if (typeof messages === 'string') {
        return messages;
    }
    if (Array.isArray(messages)) {
        return messages.map((msg) => createPromptString(msg)).join(' ');
    }

    return messages.content
        .map((msg) => {
            if (msg instanceof vscode.LanguageModelTextPart) {
                return msg.value;
            } else {
                // for tool result/call parts, estimate the token count
                return JSON.stringify(msg);
            }
        })
        .join(' ');
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
