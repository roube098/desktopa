export const DEFAULT_EDITOR_BRIDGE_TIMEOUT_MS = 8000;
export const PRESENTATION_STEADY_STATE_TIMEOUT_MS = 12000;
export const PRESENTATION_COLD_START_TIMEOUT_MS = 30000;

type OnlyOfficeToolCall = {
  contextType?: string;
  toolName?: string;
};

type OnlyOfficeRuntimeContext = {
  documentContext?: string;
  editorLoaded?: boolean;
  editorUrl?: string;
  editorFrameStatus?: string;
  editorFrameMessage?: string;
  presentationBridgeReady?: boolean;
};

type OnlyOfficeToolResult = {
  success: boolean;
  message?: string;
  data?: Record<string, unknown>;
};

/** Raw bridge payloads may attach arbitrary JSON; we normalize into `data`. */
export type OnlyOfficeToolResultInput = {
  success?: boolean;
  message?: string;
  data?: unknown;
};

function isPresentationContext(toolCall: OnlyOfficeToolCall = {}, runtimeContext: OnlyOfficeRuntimeContext = {}) {
  if (toolCall.contextType === 'presentation') return true;
  const docContext = String(runtimeContext.documentContext || '').toLowerCase();
  if (docContext === 'presentation') return true;
  const editorUrl = String(runtimeContext.editorUrl || '');
  return /\.pptx(?:$|[?#])/i.test(editorUrl) || /(?:^|[?&])fileExt=pptx(?:&|$)/i.test(editorUrl);
}

export function isPresentationColdStartContext(runtimeContext: OnlyOfficeRuntimeContext = {}) {
  if (!isPresentationContext({ contextType: 'presentation' }, runtimeContext)) {
    return false;
  }

  return !(
    runtimeContext.editorLoaded === true &&
    String(runtimeContext.editorFrameStatus || '').toLowerCase() === 'ready' &&
    runtimeContext.presentationBridgeReady === true
  );
}

export function getOnlyOfficeToolTimeoutMs(toolCall: OnlyOfficeToolCall = {}, runtimeContext: OnlyOfficeRuntimeContext = {}) {
  if (!isPresentationContext(toolCall, runtimeContext)) {
    return DEFAULT_EDITOR_BRIDGE_TIMEOUT_MS;
  }

  return isPresentationColdStartContext(runtimeContext)
    ? PRESENTATION_COLD_START_TIMEOUT_MS
    : PRESENTATION_STEADY_STATE_TIMEOUT_MS;
}

export function buildOnlyOfficeToolTimeoutResult(
  toolCall: OnlyOfficeToolCall = {},
  runtimeContext: OnlyOfficeRuntimeContext = {},
  timeoutMs: number = DEFAULT_EDITOR_BRIDGE_TIMEOUT_MS,
): OnlyOfficeToolResult {
  const coldStart = isPresentationColdStartContext(runtimeContext);
  const isPresentation = isPresentationContext(toolCall, runtimeContext);
  const timeoutBudgetMs = Number.isFinite(timeoutMs) ? Math.max(0, Math.floor(timeoutMs)) : DEFAULT_EDITOR_BRIDGE_TIMEOUT_MS;
  const data: Record<string, unknown> = {
    reason: isPresentation
      ? (coldStart ? 'presentation_editor_not_ready' : 'presentation_bridge_timeout')
      : 'editor_bridge_timeout',
    bridgeTimeoutMs: timeoutBudgetMs,
    coldStart,
    editorFrameStatus: runtimeContext.editorFrameStatus || 'unknown',
    presentationBridgeReady: runtimeContext.presentationBridgeReady === true,
  };

  if (runtimeContext.editorFrameMessage) {
    data.editorFrameMessage = runtimeContext.editorFrameMessage;
  }

  if (isPresentation && coldStart) {
    return {
      success: false,
      message: 'OnlyOffice presentation startup handshake did not complete before the timeout budget was exhausted.',
      data,
    };
  }

  return {
    success: false,
    message: isPresentation
      ? 'Timed out waiting for the OnlyOffice presentation bridge.'
      : 'Timed out waiting for the OnlyOffice editor bridge.',
    data,
  };
}

export function normalizeOnlyOfficeToolResult(
  rawResult: OnlyOfficeToolResultInput,
  toolCall: OnlyOfficeToolCall = {},
  runtimeContext: OnlyOfficeRuntimeContext = {},
): OnlyOfficeToolResult {
  const input = rawResult && typeof rawResult === 'object' ? rawResult : { success: false };
  const inputData =
    input.data && typeof input.data === 'object' && !Array.isArray(input.data)
      ? { ...(input.data as Record<string, unknown>) }
      : {};
  const normalized: OnlyOfficeToolResult = {
    success: input.success === true,
    message: typeof input.message === 'string'
      ? input.message
      : (input.success === true ? 'OnlyOffice tool completed.' : 'OnlyOffice tool failed.'),
    data: { ...inputData },
  };

  const isPresentation = isPresentationContext(toolCall, runtimeContext);
  const coldStart = isPresentation && isPresentationColdStartContext(runtimeContext);

  if (normalized.success && toolCall.toolName === 'addSlide') {
    const results = Array.isArray(normalized.data?.results)
      ? (normalized.data?.results as Array<Record<string, unknown>>)
      : [];
    const firstResult = results[0];
    if (firstResult && Number.isInteger(firstResult.slideIndex) && !Number.isInteger(normalized.data?.slideIndex)) {
      normalized.data = normalized.data || {};
      normalized.data.slideIndex = firstResult.slideIndex as number;
    }
  }

  if (!isPresentation) {
    return normalized;
  }

  let reason = typeof normalized.data?.reason === 'string' ? normalized.data.reason : '';
  const message = String(normalized.message || '');
  if (!normalized.success) {
    if (
      reason === 'bridge_unavailable_after_wait' ||
      reason === 'bridge_window_not_found_after_wait' ||
      /still initializing|plugin is not available/i.test(message)
    ) {
      reason = 'presentation_bridge_not_ready';
    } else if (
      reason === 'bridge_watchdog_timeout' ||
      reason === 'bridge_total_budget_exceeded' ||
      /timed out waiting for the onlyoffice presentation bridge/i.test(message)
    ) {
      reason = 'presentation_bridge_timeout';
    } else if (!reason) {
      reason = coldStart ? 'presentation_bridge_not_ready' : 'presentation_bridge_timeout';
    }
    normalized.data = normalized.data || {};
    normalized.data.reason = reason;
  }

  normalized.data = normalized.data || {};
  normalized.data.coldStart = coldStart;
  normalized.data.editorFrameStatus = runtimeContext.editorFrameStatus || normalized.data.editorFrameStatus || 'unknown';
  normalized.data.presentationBridgeReady = runtimeContext.presentationBridgeReady === true;

  return normalized;
}
