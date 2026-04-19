const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");

const DEBOUNCE_MS = 250;

/**
 * Watches skill root directories and emits `update` when SKILL.md trees change.
 */
class SkillsWatcher extends EventEmitter {
  constructor(getRoots) {
    super();
    this.getRoots = typeof getRoots === "function" ? getRoots : () => [];
    this.watchers = [];
    this.timer = null;
  }

  start() {
    this.stop();
    const roots = this.getRoots().filter((r) => r && typeof r === "string");
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      try {
        const w = fs.watch(root, { recursive: true }, () => this.scheduleEmit());
        this.watchers.push(w);
      } catch {
        /* platform may not support recursive */
      }
    }
  }

  stop() {
    for (const w of this.watchers) {
      try {
        w.close();
      } catch {
        /* ignore */
      }
    }
    this.watchers = [];
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  scheduleEmit() {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.emit("update");
    }, DEBOUNCE_MS);
  }
}

module.exports = { SkillsWatcher };
