const path = require("path");

const SUPPORTED_FORMATS = ["xlsx", "docx", "pptx", "pdf"];

const FORMAT_PATTERNS = {
  xlsx: [
    /\bxlsv\b/i,
    /\bxlsx\b/i,
    /\bxls\b/i,
    /\bspreadsheet\b/i,
    /\bworkbook\b/i,
    /\bsheet\b/i,
  ],
  docx: [
    /\bdocx\b/i,
    /\bword\s+document\b/i,
    /\bdocument\s+file\b/i,
    /\bdoc\b/i,
  ],
  pptx: [
    /\bpptx\b/i,
    /\bppt\b/i,
    /\bpowerpoint\b/i,
    /\bpresentation\b/i,
    /\bslide\s*deck\b/i,
    /\bslides\b/i,
  ],
  pdf: [
    /\bpdf\b/i,
    /\bportable\s+document\b/i,
  ],
};

const EXPLICIT_CREATE_INTENT_PATTERNS = [
  /\bcreate\b/i,
  /\bgenerate\b/i,
  /\bnew\s+file\b/i,
  /\bmake\b/i,
  /\bbuild\b/i,
  /\bproduce\b/i,
  /\bsave\s+as\b/i,
];

const EXPLICIT_EXPORT_INTENT_PATTERNS = [
  /\bexport\b/i,
  /\bconvert\b/i,
  /\bsave\s+as\b/i,
  /\bdownload\s+as\b/i,
];

function normalizeFormat(rawFormat) {
  const candidate = String(rawFormat || "").trim().toLowerCase().replace(/^\./, "");
  if (!candidate) return "";
  if (candidate === "xlsv") return "xlsx";
  if (candidate === "xls") return "xlsx";
  if (candidate === "doc") return "docx";
  if (candidate === "ppt") return "pptx";
  return candidate;
}

function isSupportedFormat(rawFormat) {
  return SUPPORTED_FORMATS.includes(normalizeFormat(rawFormat));
}

function inferFormatsFromPrompt(input) {
  const text = String(input || "");
  const matches = new Set();

  for (const format of SUPPORTED_FORMATS) {
    const patterns = FORMAT_PATTERNS[format] || [];
    if (patterns.some((pattern) => pattern.test(text))) {
      matches.add(format);
    }
  }

  return [...matches];
}

function hasExplicitIntent(prompt, mode = "create") {
  const text = String(prompt || "");
  if (!text.trim()) return false;
  const patterns = mode === "export" ? EXPLICIT_EXPORT_INTENT_PATTERNS : EXPLICIT_CREATE_INTENT_PATTERNS;
  return patterns.some((pattern) => pattern.test(text));
}

function resolveFormatSelection(options = {}) {
  const requestedFormat = normalizeFormat(options.requestedFormat);
  const prompt = String(options.prompt || "");
  const title = String(options.title || "");
  const mode = options.mode === "export" ? "export" : "create";
  const defaultFormat = normalizeFormat(options.defaultFormat);

  if (requestedFormat) {
    if (!isSupportedFormat(requestedFormat)) {
      return {
        status: "unsupported",
        requiresClarification: true,
        message: `Unsupported format '${requestedFormat}'. Supported formats: ${SUPPORTED_FORMATS.join(", ")}.`,
      };
    }
    return {
      status: "resolved",
      format: requestedFormat,
      source: "requested",
    };
  }

  const combinedText = [prompt, title].filter(Boolean).join(" ").trim();
  const inferred = inferFormatsFromPrompt(combinedText);

  if (inferred.length === 1) {
    return {
      status: "resolved",
      format: inferred[0],
      source: "prompt",
    };
  }

  if (inferred.length > 1) {
    return {
      status: "ambiguous",
      requiresClarification: true,
      message: `Multiple formats detected (${inferred.join(", ")}). Ask the user to pick one format.`,
    };
  }

  if (defaultFormat && isSupportedFormat(defaultFormat)) {
    return {
      status: "resolved",
      format: defaultFormat,
      source: "default",
    };
  }

  if (combinedText && !hasExplicitIntent(combinedText, mode)) {
    return {
      status: "missing_intent",
      requiresClarification: true,
      message: "No explicit file-generation intent detected. Continue editing unless the user explicitly asks to create/generate/export a file.",
    };
  }

  return {
    status: "ambiguous",
    requiresClarification: true,
    message: `Format is ambiguous. Ask the user to choose one of: ${SUPPORTED_FORMATS.join(", ")}.`,
  };
}

function slugifyTitle(input, fallback = "file") {
  const text = String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!text) return fallback;
  return text.slice(0, 80).replace(/-+$/g, "") || fallback;
}

function formatTimestamp(date = new Date()) {
  const pad2 = (value) => String(value).padStart(2, "0");
  const yyyy = String(date.getFullYear());
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const hh = pad2(date.getHours());
  const min = pad2(date.getMinutes());
  const ss = pad2(date.getSeconds());
  return `${yyyy}${mm}${dd}-${hh}${min}${ss}`;
}

function defaultBaseNameForFormat(format) {
  switch (normalizeFormat(format)) {
    case "xlsx":
      return "spreadsheet";
    case "docx":
      return "document";
    case "pptx":
      return "presentation";
    case "pdf":
      return "pdf";
    default:
      return "file";
  }
}

function buildDeterministicFileName(options = {}) {
  const format = normalizeFormat(options.format);
  if (!isSupportedFormat(format)) {
    throw new Error(`Cannot build file name for unsupported format '${options.format}'.`);
  }

  const baseName = slugifyTitle(options.title, defaultBaseNameForFormat(format));
  const timestamp = formatTimestamp(options.date || new Date());
  return `${baseName}-${timestamp}.${format}`;
}

function resolveUniqueFilePath(directory, fileName, fileExists) {
  const exists = typeof fileExists === "function" ? fileExists : () => false;
  const extension = path.extname(fileName);
  const base = path.basename(fileName, extension);

  let candidate = path.join(directory, fileName);
  let suffix = 2;

  while (exists(candidate)) {
    candidate = path.join(directory, `${base}-${suffix}${extension}`);
    suffix += 1;
  }

  return candidate;
}

module.exports = {
  SUPPORTED_FORMATS,
  normalizeFormat,
  isSupportedFormat,
  inferFormatsFromPrompt,
  hasExplicitIntent,
  resolveFormatSelection,
  slugifyTitle,
  formatTimestamp,
  buildDeterministicFileName,
  resolveUniqueFilePath,
};
