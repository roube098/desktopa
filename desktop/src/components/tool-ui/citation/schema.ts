export type CitationType = "webpage" | "document" | "article" | "api" | "code" | "other";

export interface SerializableCitation {
    id: string;
    href: string;
    title: string;
    snippet?: string;
    domain?: string;
    favicon?: string;
    author?: string;
    publishedAt?: string;
    type?: CitationType;
}

export function safeParseSerializableCitation(result: any): SerializableCitation | null {
    if (typeof result !== "object" || result === null) {
        return null;
    }

    // Required fields: id, href, title
    if (typeof result.id !== "string" || typeof result.href !== "string" || typeof result.title !== "string") {
        return null;
    }

    return {
        id: result.id,
        href: result.href,
        title: result.title,
        snippet: typeof result.snippet === "string" ? result.snippet : undefined,
        domain: typeof result.domain === "string" ? result.domain : undefined,
        favicon: typeof result.favicon === "string" ? result.favicon : undefined,
        author: typeof result.author === "string" ? result.author : undefined,
        publishedAt: typeof result.publishedAt === "string" ? result.publishedAt : undefined,
        type: typeof result.type === "string" ? result.type as CitationType : "webpage"
    };
}
