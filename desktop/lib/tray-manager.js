const { Tray, Menu, nativeImage } = require("electron");
const path = require("path");

class TrayManager {
    constructor(iconPath, mainWindow, onQuit) {
        this.mainWindow = mainWindow;
        this.onQuit = onQuit;

        const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
        this.tray = new Tray(icon);
        this.tray.setToolTip("Excelor");

        this._buildMenu({ backend: "stopped", onlyoffice: "stopped" });

        this.tray.on("double-click", () => {
            if (mainWindow) mainWindow.show();
        });
    }

    updateStatus(status) {
        this._buildMenu(status);
    }

    _buildMenu(status) {
        const backendLabel = `Backend: ${this._icon(status.backend)} ${status.backend}`;
        const ooLabel = `ONLYOFFICE: ${this._icon(status.onlyoffice)} ${status.onlyoffice}`;

        const contextMenu = Menu.buildFromTemplate([
            { label: "Excelor", enabled: false },
            { type: "separator" },
            { label: backendLabel, enabled: false },
            { label: ooLabel, enabled: false },
            { type: "separator" },
            {
                label: "Show Window",
                click: () => {
                    if (this.mainWindow) this.mainWindow.show();
                },
            },
            { type: "separator" },
            {
                label: "Quit",
                click: () => {
                    if (this.onQuit) this.onQuit();
                },
            },
        ]);

        this.tray.setContextMenu(contextMenu);
    }

    _icon(state) {
        switch (state) {
            case "ready": return "🟢";
            case "starting": return "🟡";
            case "error": return "🔴";
            default: return "⚪";
        }
    }
}

module.exports = TrayManager;
