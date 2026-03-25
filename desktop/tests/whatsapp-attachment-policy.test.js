const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { resolveWhatsAppAttachmentReference } = require("../lib/whatsapp-attachment-policy");

function createWorkspaceDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "excelor-whatsapp-workspace-"));
}

test("resolves a relative workspace path", async () => {
  const workspaceDir = createWorkspaceDir();
  try {
    const docsDir = path.join(workspaceDir, "docs");
    fs.mkdirSync(docsDir, { recursive: true });
    const filePath = path.join(docsDir, "report.pdf");
    fs.writeFileSync(filePath, "hello", "utf8");

    const result = await resolveWhatsAppAttachmentReference({
      workspaceDir,
      reference: "docs/report.pdf",
    });

    assert.equal(result.absolutePath, filePath);
    assert.equal(result.relativePath, "docs/report.pdf");
    assert.equal(result.fileName, "report.pdf");
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test("resolves an absolute path inside the workspace", async () => {
  const workspaceDir = createWorkspaceDir();
  try {
    const filePath = path.join(workspaceDir, "deck.pptx");
    fs.writeFileSync(filePath, "hello", "utf8");

    const result = await resolveWhatsAppAttachmentReference({
      workspaceDir,
      reference: filePath,
    });

    assert.equal(result.absolutePath, filePath);
    assert.equal(result.relativePath, "deck.pptx");
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test("rejects absolute paths outside the workspace", async () => {
  const workspaceDir = createWorkspaceDir();
  const outsideDir = createWorkspaceDir();
  try {
    const filePath = path.join(outsideDir, "secret.pdf");
    fs.writeFileSync(filePath, "hello", "utf8");

    await assert.rejects(
      resolveWhatsAppAttachmentReference({
        workspaceDir,
        reference: filePath,
      }),
      /inside My Workspace/,
    );
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
    fs.rmSync(outsideDir, { recursive: true, force: true });
  }
});

test("resolves a unique basename match", async () => {
  const workspaceDir = createWorkspaceDir();
  try {
    const nestedDir = path.join(workspaceDir, "reports");
    fs.mkdirSync(nestedDir, { recursive: true });
    const filePath = path.join(nestedDir, "summary.txt");
    fs.writeFileSync(filePath, "hello", "utf8");

    const result = await resolveWhatsAppAttachmentReference({
      workspaceDir,
      reference: "summary.txt",
    });

    assert.equal(result.absolutePath, filePath);
    assert.equal(result.relativePath, "reports/summary.txt");
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test("rejects ambiguous basename matches with candidate paths", async () => {
  const workspaceDir = createWorkspaceDir();
  try {
    const firstDir = path.join(workspaceDir, "reports");
    const secondDir = path.join(workspaceDir, "archive");
    fs.mkdirSync(firstDir, { recursive: true });
    fs.mkdirSync(secondDir, { recursive: true });
    fs.writeFileSync(path.join(firstDir, "summary.txt"), "hello", "utf8");
    fs.writeFileSync(path.join(secondDir, "summary.txt"), "hello", "utf8");

    await assert.rejects(
      resolveWhatsAppAttachmentReference({
        workspaceDir,
        reference: "summary.txt",
      }),
      /archive\/summary\.txt, reports\/summary\.txt|reports\/summary\.txt, archive\/summary\.txt/,
    );
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test("rejects nonexistent files", async () => {
  const workspaceDir = createWorkspaceDir();
  try {
    await assert.rejects(
      resolveWhatsAppAttachmentReference({
        workspaceDir,
        reference: "missing.pdf",
      }),
      /No workspace file matched/,
    );
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test("rejects directory references", async () => {
  const workspaceDir = createWorkspaceDir();
  try {
    const docsDir = path.join(workspaceDir, "docs");
    fs.mkdirSync(docsDir, { recursive: true });

    await assert.rejects(
      resolveWhatsAppAttachmentReference({
        workspaceDir,
        reference: "./docs",
      }),
      /regular file/,
    );
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test("rejects symlink references", { skip: process.platform === "win32" }, async () => {
  const workspaceDir = createWorkspaceDir();
  try {
    const targetPath = path.join(workspaceDir, "report.pdf");
    const linkPath = path.join(workspaceDir, "linked-report.pdf");
    fs.writeFileSync(targetPath, "hello", "utf8");
    fs.symlinkSync(targetPath, linkPath);

    await assert.rejects(
      resolveWhatsAppAttachmentReference({
        workspaceDir,
        reference: "linked-report.pdf",
      }),
      /Symlink not allowed/,
    );
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});
