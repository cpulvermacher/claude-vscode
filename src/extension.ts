import * as vscode from 'vscode';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { Anthropic } from '@anthropic-ai/sdk'; // Import Anthropic SDK

const CLAUDE_PARTICIPANT_ID = 'vscode-samples.claude';

interface IClaudeChatResult extends vscode.ChatResult {
    metadata: {
        command: string;
    }
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
    }
});

// Initialize Anthropic client

export function activate(context: vscode.ExtensionContext) {
    // Load .env file from the extension's root directory
    dotenv.config({ path: path.join(context.extensionPath, '.env') });

    let anthropic: Anthropic | undefined;
    const handler: vscode.ChatRequestHandler = async (request: vscode.ChatRequest, context: vscode.ChatContext, stream: vscode.ChatResponseStream, token: vscode.CancellationToken): Promise<IClaudeChatResult> => {
        if (!anthropic) {
            let apiKey = process.env.ANTHROPIC_API_KEY;
            if (!apiKey) {
                apiKey = await vscode.window.showInputBox({
                    prompt: 'Enter your Anthropic API Key',
                    ignoreFocusOut: true,
                    password: true
                });

                if (!apiKey) {
                    stream.markdown('API Key is required to proceed.');
                    throw new Error('API Key is required');
                }
            }
            anthropic = new Anthropic({
                apiKey
            });
        }

        try {
            return await new Promise<IClaudeChatResult>((resolve, reject) => {
                anthropic!.messages.stream({
                    model: "claude-3-5-sonnet-20240620", 
                    messages: [{ role: "user", content: request.prompt }],
                    stream: true,
                    max_tokens: 1000 // Ensure max_tokens is provided
                }).on('text', (text) => {
                    stream.markdown(text);
                }).on('error', (err) => {
                    handleError(logger, err, stream);
                    reject(err);
                }).on('finalMessage', () => {
                    resolve({ metadata: { command: 'claude_chat' } });
                });
            });
        } catch(err) {
            handleError(logger, err, stream);
        }

        logger.logUsage('request', { kind: 'claude' });
        return { metadata: { command: 'claude_chat' } };
    };

    const claude = vscode.chat.createChatParticipant(CLAUDE_PARTICIPANT_ID, handler);
    claude.iconPath = vscode.Uri.joinPath(context.extensionUri, 'anthropic-icon.png'); // Update icon if needed

    context.subscriptions.push(claude);
}

function handleError(logger: vscode.TelemetryLogger, err: any, stream: vscode.ChatResponseStream): void {
    logger.logError(err);
    
    if (err instanceof Error) {
        console.error(err.message);
        stream.markdown(`An error occurred: ${err.message}`);
    } else {
        console.error('An unknown error occurred');
        stream.markdown('An unknown error occurred');
    }
}

export function deactivate() { }
