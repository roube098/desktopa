import type {
  AttachmentAdapter,
  PendingAttachment,
  CompleteAttachment,
} from "@assistant-ui/core";

const PDF_EXTRACT_RESULT_STORAGE = new WeakMap<PendingAttachment, { text: string }>();

async function extractPdfFromFile(file: File): Promise<string> {
  const api = (window as unknown as { electronAPI?: { extractPdfText: (path: string) => Promise<{ text?: string; error?: string }>; extractPdfTextFromBuffer: (base64: string) => Promise<{ text?: string; error?: string }> } }).electronAPI;
  if (!api) {
    throw new Error("Electron API not available");
  }

  const path = (file as File & { path?: string }).path;
  if (path && typeof path === "string") {
    const result = await api.extractPdfText(path);
    if (result.error) throw new Error(result.error);
    return result.text ?? "";
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64Part = dataUrl.indexOf(",") >= 0 ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
      resolve(base64Part);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
  const result = await api.extractPdfTextFromBuffer(base64);
  if (result.error) throw new Error(result.error);
  return result.text ?? "";
}

export class PdfAttachmentAdapter implements AttachmentAdapter {
  public accept = ".pdf,application/pdf";

  public async add(state: { file: File }): Promise<PendingAttachment> {
    const file = state.file;
    let text: string;
    try {
      text = await extractPdfFromFile(file);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Failed to extract PDF text");
    }
    const pending: PendingAttachment = {
      id: `pdf-${file.name}-${Date.now()}`,
      type: "document",
      name: file.name,
      contentType: file.type || "application/pdf",
      file,
      status: { type: "requires-action", reason: "composer-send" },
    };
    PDF_EXTRACT_RESULT_STORAGE.set(pending, { text });
    return pending;
  }

  public async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
    const stored = PDF_EXTRACT_RESULT_STORAGE.get(attachment);
    const text = stored?.text ?? "";
    return {
      ...attachment,
      status: { type: "complete" },
      content: [
        {
          type: "data",
          name: "pdf",
          data: { fileName: attachment.name, text },
        },
      ],
    };
  }

  public async remove(): Promise<void> {
    // noop
  }
}
