const pty = require('node-pty');
const { app, shell } = require('electron');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function stripAnsi(string) {
    if (typeof string !== 'string') return string;
    return string.replace(
        /[\u001b\u009b][[()#;?]*(?:(?:(?:(?:;[-a-zA-Z\d\/#&.:=?%@~_]+)*|[a-zA-Z\d]+(?:;[-a-zA-Z\d\/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g,
        ''
    );
}

function quoteForShell(arg) {
    if (/^[a-zA-Z0-9_.\-/:]+$/.test(arg)) return arg;
    if (process.platform === 'win32') {
        const escaped = arg.replace(/"/g, '""');
        return `"${escaped}"`;
    }
    return `'${arg.replace(/'/g, "'\\''")}'`;
}

class OAuthBrowserFlow {
    constructor() {
        this.activePty = null;
        this.isDisposed = false;
    }

    isInProgress() {
        return this.activePty !== null && !this.isDisposed;
    }

    async start() {
        if (this.isInProgress()) {
            await this.cancel();
        }

        // Determine OpenCode CLI path (assuming it's available globally or we use NPX if needed,
        // but for Excelor we will try to invoke it via npx if it isn't globally installed)
        let command = 'npx';
        let args = ['--yes', '@accomplish_ai/opencode@latest', 'auth', 'login'];

        // If openwork opencode is installed globally, we can just use `opencode auth login`
        try {
            execSync('opencode --version', { stdio: 'ignore' });
            command = 'opencode';
            args = ['auth', 'login'];
        } catch (e) {
            // fallback to npx
        }

        const shellCmd = process.platform === 'win32' ? 'powershell.exe' : 'bash';

        let shellArgs = [];
        if (process.platform === 'win32') {
            const fullCommand = [command, ...args].map(quoteForShell).join(' ');
            shellArgs = ['-NoProfile', '-NonInteractive', '-Command', fullCommand];
        } else {
            const fullCommand = [command, ...args].map(quoteForShell).join(' ');
            shellArgs = ['-c', fullCommand];
        }

        const env = { ...process.env };
        const safeCwd = os.tmpdir();

        return new Promise((resolve, reject) => {
            let openedUrl;
            let hasSelectedProvider = false;
            let hasSelectedLoginMethod = false;
            let buffer = '';

            const proc = pty.spawn(shellCmd, shellArgs, {
                name: 'xterm-256color',
                cols: 120,
                rows: 30,
                cwd: safeCwd,
                env,
            });

            this.activePty = proc;

            const cleanup = () => {
                this.activePty = null;
            };

            const tryOpenExternal = async (url) => {
                if (openedUrl) return;
                try {
                    const parsed = new URL(url);
                    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
                    openedUrl = url;
                    await shell.openExternal(url);
                } catch {
                    // ignore
                }
            };

            proc.onData((data) => {
                const clean = stripAnsi(data);
                buffer += clean;
                if (buffer.length > 20000) buffer = buffer.slice(-20000);

                // Auto-select OpenAI Provider
                if (!hasSelectedProvider && buffer.includes('Select provider')) {
                    hasSelectedProvider = true;
                    proc.write('OpenAI\r');
                }

                // Auto-select Default Login Method (usually Browser OAuth)
                if (hasSelectedProvider && !hasSelectedLoginMethod && buffer.includes('Login method')) {
                    hasSelectedLoginMethod = true;
                    proc.write('\r');
                }

                // Capture the OAuth URL
                const match = clean.match(/Go to:\s*(https?:\/\/\S+)/);
                if (match?.[1]) {
                    tryOpenExternal(match[1]);
                }
            });

            proc.onExit(({ exitCode, signal }) => {
                cleanup();

                if (exitCode === 0) {
                    resolve({ openedUrl, connected: true });
                    return;
                }

                const tail = buffer.trim().split('\n').slice(-15).join('\n');
                reject(
                    new Error(
                        `OAuth login failed (exit ${exitCode})` +
                        (tail ? `\n\nOutput:\n${tail}` : '')
                    )
                );
            });
        });
    }

    async cancel() {
        if (!this.activePty) return;

        const ptyProcess = this.activePty;
        ptyProcess.write('\x03'); // Ctrl+C

        if (process.platform === 'win32') {
            await new Promise(r => setTimeout(r, 100));
            ptyProcess.write('Y\n');
        }

        // Force kill after 1s
        setTimeout(() => {
            if (this.activePty === ptyProcess) {
                try { ptyProcess.kill(); } catch (err) { }
            }
        }, 1000);

        this.activePty = null;
    }

    dispose() {
        if (this.isDisposed) return;
        this.isDisposed = true;
        if (this.activePty) {
            try { this.activePty.kill(); } catch (err) { }
            this.activePty = null;
        }
    }
}

const oauthBrowserFlow = new OAuthBrowserFlow();

async function loginOpenAiWithChatGpt() {
    return oauthBrowserFlow.start();
}

module.exports = {
    loginOpenAiWithChatGpt,
    oauthBrowserFlow
};
