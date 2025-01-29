**WARNING** Since this uses proposed APIs, you need to install the extension .vsix manually, add
```
"enable-proposed-api": ["cpulvermacher.claude"]
```
to your `.vscode/argv.json` and restart VSCode. See the documentation on [Proposed APIs](https://code.visualstudio.com/api/advanced-topics/using-proposed-api) for more details.

# Anthropic Claude Chat Extension for VS Code

This Visual Studio Code extension integrates Anthropic's Claude chat capabilities directly into your development environment, allowing you to interact with the Claude Sonnet AI model without leaving your editor.

## Features

- Seamless integration with VS Code's chat interface
- Direct communication with Anthropic's API
- Support for streaming responses

## Prerequisites

Before using this extension, you need to have an Anthropic API key. If you don't have one, you can obtain it from [Anthropic's website](https://www.anthropic.com/).

## Installation

1. Install the extension from the VS Code marketplace or by searching for "Claude Chat" in the Extensions view.
2. Reload VS Code after installation.

## Setup

The extension will prompt you to enter your API key when you first use it.

## Usage

1. Open the Command Palette (Ctrl+Shift+P or Cmd+Shift+P on macOS).
2. Type "Claude Chat" and select it from the list.
3. Type your question or prompt in the chat input.
4. Claude's response will be streamed back to you in the chat window.

## Configuration

The extension currently uses the "claude-3-5-sonnet-20240620" model by default. You can change this in the `src/extension.ts` file if you prefer a different model.

## Error Handling

The extension includes basic error handling. If an error occurs, it will be displayed in the chat window and logged for debugging purposes.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

## Disclaimer

This extension is not officially associated with Anthropic. It's an independent project that uses Anthropic's API.

## Support

If you encounter any issues or have questions, please open an issue on the GitHub repository.
