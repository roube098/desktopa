const { execFile, spawn } = require("child_process");
const { EventEmitter } = require("events");
const http = require("http");
const net = require("net");
const path = require("path");
const fs = require("fs");

class DockerManager extends EventEmitter {
    constructor(projectRoot) {
        super();
        this.root = projectRoot;
        this.status = { backend: "stopped", onlyoffice: "stopped" };
        this.ports = { backend: 8090, onlyoffice: 8080 };
        this._healthTimer = null;
        this._exampleEnsurePromise = null;
    }

    getStatus() {
        return { ...this.status };
    }

    getPorts() {
        return { ...this.ports };
    }

    async start() {
        this._setStatus("backend", "starting");
        this._setStatus("onlyoffice", "starting");

        try {
            // First try to detect already-running containers from existing .env
            const existingPorts = this._readEnvPorts();
            if (existingPorts) {
                const backendOk = await this._httpCheck(
                    `http://localhost:${existingPorts.backend}/api/health`,
                    "onlyoffice-spreadsheet-agent"
                );
                const ooOk = await this._httpCheck(
                    `http://localhost:${existingPorts.onlyoffice}/healthcheck`,
                    "true"
                );

                if (backendOk || ooOk) {
                    // Containers are already running, use existing ports
                    this.ports = existingPorts;
                    this.emit("ports-resolved", this.getPorts());
                    this._startHealthCheck();
                    return;
                }
            }

            // Containers not running — resolve ports and start them
            this.ports.backend = await this._findFreePort(8090);
            this.ports.onlyoffice = await this._findFreePort(8080);
            this.emit("ports-resolved", this.getPorts());

            // Write .env so docker-compose picks up the ports
            const envPath = path.join(this.root, ".env");
            const envContent = `BACKEND_PORT=${this.ports.backend}\nONLYOFFICE_PORT=${this.ports.onlyoffice}\n`;
            fs.writeFileSync(envPath, envContent, "utf-8");

            // Write plugin runtime-config
            const rcPath = path.join(this.root, "plugin", "runtime-config.json");
            const rc = JSON.stringify({ backendUrl: `http://localhost:${this.ports.backend}` });
            fs.writeFileSync(rcPath, rc, "utf-8");

            // Ensure volume directories exist
            for (const sub of ["logs", "data", "lib", "db"]) {
                const dir = path.join(this.root, "onlyoffice-data", sub);
                fs.mkdirSync(dir, { recursive: true });
            }

            // Start docker compose
            await this._exec("docker", ["compose", "up", "-d", "--build"]);

            // Start health polling
            this._startHealthCheck();
        } catch (err) {
            this._setStatus("backend", "error");
            this._setStatus("onlyoffice", "error");
            this.emit("error", err);
        }
    }

    _readEnvPorts() {
        try {
            const envPath = path.join(this.root, ".env");
            if (!fs.existsSync(envPath)) return null;
            const content = fs.readFileSync(envPath, "utf-8");
            const backendMatch = content.match(/BACKEND_PORT\s*=\s*(\d+)/);
            const ooMatch = content.match(/ONLYOFFICE_PORT\s*=\s*(\d+)/);
            if (!backendMatch || !ooMatch) return null;
            return {
                backend: parseInt(backendMatch[1], 10),
                onlyoffice: parseInt(ooMatch[1], 10),
            };
        } catch (_) {
            return null;
        }
    }

    async stop() {
        this._stopHealthCheck();
        try {
            await this._exec("docker", ["compose", "down"]);
        } catch (err) {
            // Best effort
        }
        this._setStatus("backend", "stopped");
        this._setStatus("onlyoffice", "stopped");
    }

    _setStatus(service, state) {
        if (this.status[service] !== state) {
            this.status[service] = state;
            this.emit("status-changed", this.getStatus());
        }
    }

    _startHealthCheck() {
        this._stopHealthCheck();
        const readyState = { emitted: false };
        let checkInFlight = false;

        const runHealthCheck = async () => {
            if (checkInFlight) return;
            checkInFlight = true;
            try {
                await this._performHealthCheck(readyState);
            } finally {
                checkInFlight = false;
            }
        };

        this._healthTimer = setInterval(() => {
            void runHealthCheck();
        }, 3000);

        void runHealthCheck();
    }

    _stopHealthCheck() {
        if (this._healthTimer) {
            clearInterval(this._healthTimer);
            this._healthTimer = null;
        }
    }

    _httpCheck(url, expectedText) {
        return new Promise((resolve) => {
            const u = new URL(url);
            const opts = {
                hostname: u.hostname,
                port: u.port,
                path: u.pathname,
                timeout: 4000,
            };
            const req = http.get(opts, (res) => {
                let body = "";
                res.on("data", (chunk) => (body += chunk));
                res.on("end", () => {
                    resolve(res.statusCode >= 200 && res.statusCode < 400 && body.includes(expectedText));
                });
            });
            req.on("error", () => resolve(false));
            req.on("timeout", () => { req.destroy(); resolve(false); });
        });
    }

    async _performHealthCheck(readyState = { emitted: false }) {
        const backendOk = await this._httpCheck(
            `http://localhost:${this.ports.backend}/api/health`,
            "onlyoffice-spreadsheet-agent"
        );
        this._setStatus("backend", backendOk ? "ready" : "starting");

        const onlyofficeHealthy = await this._httpCheck(
            `http://localhost:${this.ports.onlyoffice}/healthcheck`,
            "true"
        );

        let exampleReady = false;
        if (onlyofficeHealthy) {
            try {
                exampleReady = await this._ensureOnlyOfficeExampleReady();
            } catch (err) {
                exampleReady = false;
                this.emit("error", err);
            }
        }

        this._setStatus("onlyoffice", onlyofficeHealthy && exampleReady ? "ready" : "starting");

        if (backendOk && onlyofficeHealthy && exampleReady && !readyState.emitted) {
            readyState.emitted = true;
            this.emit("ready");
        }
    }

    async _ensureOnlyOfficeExampleReady() {
        if (this._exampleEnsurePromise) {
            return await this._exampleEnsurePromise;
        }

        this._exampleEnsurePromise = (async () => {
            if (await this._isOnlyOfficeExampleReady()) {
                return true;
            }

            const status = await this._getOnlyOfficeExampleStatus();
            if (!/\bRUNNING\b/.test(status)) {
                await this._startOnlyOfficeExample();
            }

            for (let attempt = 0; attempt < 15; attempt += 1) {
                if (await this._isOnlyOfficeExampleReady()) {
                    return true;
                }
                await this._sleep(1000);
            }

            throw new Error("OnlyOffice example service did not become ready.");
        })();

        try {
            return await this._exampleEnsurePromise;
        } finally {
            this._exampleEnsurePromise = null;
        }
    }

    async _isOnlyOfficeExampleReady() {
        return await this._httpCheck(
            `http://localhost:${this.ports.onlyoffice}/example/`,
            "<!DOCTYPE html"
        );
    }

    async _getOnlyOfficeExampleStatus() {
        try {
            return await this._exec("docker", [
                "exec", "spreadsheet-ai-onlyoffice",
                "supervisorctl", "status", "ds:example",
            ]);
        } catch (err) {
            return err && err.message ? err.message : String(err);
        }
    }

    async _startOnlyOfficeExample() {
        await this._exec("docker", [
            "exec", "spreadsheet-ai-onlyoffice",
            "supervisorctl", "start", "ds:example",
        ]);
    }

    _sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    _findFreePort(preferred) {
        return new Promise((resolve) => {
            const tryPort = (port) => {
                const server = net.createServer();
                server.once("error", () => tryPort(port + 1));
                server.once("listening", () => {
                    server.close(() => resolve(port));
                });
                server.listen(port, "127.0.0.1");
            };
            tryPort(preferred);
        });
    }

    _exec(cmd, args) {
        return new Promise((resolve, reject) => {
            const proc = execFile(cmd, args, {
                cwd: this.root,
                windowsHide: true,
                timeout: 300000,
            }, (err, stdout, stderr) => {
                if (err) reject(new Error(`${cmd} ${args.join(" ")} failed: ${stderr || err.message}`));
                else resolve(stdout);
            });
        });
    }
}

module.exports = DockerManager;
