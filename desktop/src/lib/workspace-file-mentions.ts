const RESERVED_QUERY = 'pdf';
const MAX_RESULTS = 50;

export type WorkspaceMentionMatch =
  | {
      type: 'file';
      start: number;
      end: number;
      query: string;
      token: string;
    }
  | {
      type: 'reserved';
      start: number;
      end: number;
      query: string;
      token: string;
      keyword: typeof RESERVED_QUERY;
    };

function isWhitespace(value: string | undefined): boolean {
  return !value || /[\s()[\]{}<>,;:!?'"`]/.test(value);
}

export function getActiveWorkspaceMention(
  text: string,
  caretStart: number,
  caretEnd: number,
): WorkspaceMentionMatch | null {
  if (caretStart !== caretEnd) return null;
  if (!text) return null;

  const safeStart = Math.max(0, Math.min(caretStart, text.length));
  const safeEnd = Math.max(0, Math.min(caretEnd, text.length));

  let tokenStart = safeStart;
  while (tokenStart > 0 && !isWhitespace(text[tokenStart - 1])) {
    tokenStart -= 1;
  }

  let tokenEnd = safeEnd;
  while (tokenEnd < text.length && !isWhitespace(text[tokenEnd])) {
    tokenEnd += 1;
  }

  const token = text.slice(tokenStart, tokenEnd);
  if (!token.startsWith('@')) return null;

  const query = token.slice(1);
  if (query.toLowerCase() === RESERVED_QUERY) {
    return {
      type: 'reserved',
      start: tokenStart,
      end: tokenEnd,
      query,
      token,
      keyword: RESERVED_QUERY,
    };
  }

  return {
    type: 'file',
    start: tokenStart,
    end: tokenEnd,
    query,
    token,
  };
}

export function rankWorkspaceFiles(files: WorkspaceFile[], query: string): WorkspaceFile[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return files.slice(0, MAX_RESULTS);
  }

  const ranked = files
    .map((file, index) => {
      const normalizedName = file.name.toLowerCase();
      const normalizedPath = file.relativePath.toLowerCase();

      let rank: number | null = null;
      if (normalizedName === normalizedQuery) {
        rank = 0;
      } else if (normalizedName.startsWith(normalizedQuery)) {
        rank = 1;
      } else if (normalizedPath.startsWith(normalizedQuery)) {
        rank = 2;
      } else if (normalizedName.includes(normalizedQuery)) {
        rank = 3;
      } else if (normalizedPath.includes(normalizedQuery)) {
        rank = 4;
      }

      return rank === null
        ? null
        : {
            file,
            index,
            rank,
          };
    })
    .filter((entry): entry is { file: WorkspaceFile; index: number; rank: number } => Boolean(entry))
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }
      return left.index - right.index;
    });

  return ranked.slice(0, MAX_RESULTS).map((entry) => entry.file);
}

export function formatInsertedWorkspaceReference(relativePath: string): string {
  const normalized = String(relativePath || '').trim();
  if (!normalized) return '';
  return /\s/.test(normalized) ? `"${normalized}" ` : `${normalized} `;
}
