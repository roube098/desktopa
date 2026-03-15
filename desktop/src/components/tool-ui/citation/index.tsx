"use client";

import { type FC } from "react";
import { FileText, Link, Code, Server, BookOpen, Quote, Boxes, Globe } from "lucide-react";
import { cn } from "../../../lib/utils";
import { SerializableCitation } from "./schema";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@radix-ui/react-tooltip";

type CitationVariant = "default" | "inline" | "stacked";

export interface CitationProps extends SerializableCitation {
    variant?: CitationVariant;
    onNavigate?: (href: string, citation: SerializableCitation) => void;
}

const IconMap = {
    webpage: Globe,
    document: FileText,
    article: BookOpen,
    api: Server,
    code: Code,
    other: Link,
};

export const Citation: FC<CitationProps> = ({
    variant = "default",
    id,
    href,
    title,
    snippet,
    domain,
    favicon,
    author,
    publishedAt,
    type = "webpage",
    onNavigate,
}) => {
    const Icon = IconMap[type] || IconMap.other;

    // Automatically extract domain if not provided
    const displayDomain = domain || (() => {
        try {
            return new URL(href).hostname.replace(/^www\./, '');
        } catch {
            return href;
        }
    })();

    const handleNavigate = (e: React.MouseEvent<HTMLAnchorElement>) => {
        if (onNavigate) {
            e.preventDefault();
            onNavigate(href, { id, href, title, snippet, domain, favicon, author, publishedAt, type });
        }
    };

    const renderFavicon = (className?: string) => {
        if (favicon) {
            return <img src={favicon} alt={title} className={cn("aui-citation-favicon", className)} />;
        }
        return <Icon className={cn("aui-citation-icon", className)} size={16} />;
    };

    if (variant === "inline") {
        return (
            <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleNavigate}
                className="aui-citation-inline"
            >
                {renderFavicon("w-4 h-4")}
                <span className="aui-citation-title-inline truncate max-w-[150px]">{title}</span>
            </a>
        );
    }

    if (variant === "stacked") {
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <a
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={handleNavigate}
                            className="aui-citation-stacked"
                        >
                            {renderFavicon("w-5 h-5")}
                        </a>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="aui-citation-tooltip z-50">
                        <div className="flex flex-col gap-1 max-w-[200px]">
                            <span className="font-semibold text-sm truncate">{title}</span>
                            <span className="text-xs text-muted-foreground truncate">{displayDomain}</span>
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    }

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleNavigate}
            className="aui-citation-default"
        >
            <div className="aui-citation-header">
                <div className="aui-citation-source flex items-center gap-2">
                    {renderFavicon("w-4 h-4")}
                    <span className="text-xs text-muted-foreground font-medium">{displayDomain}</span>
                </div>
                <h4 className="font-semibold text-sm text-foreground line-clamp-1 mt-1">{title}</h4>
                {(author || publishedAt) && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        {author && <span>{author}</span>}
                        {author && publishedAt && <span>•</span>}
                        {publishedAt && <span>{new Date(publishedAt).toLocaleDateString()}</span>}
                    </div>
                )}
            </div>
            {snippet && (
                <div className="aui-citation-snippet mt-2 pt-2 border-t border-border/50 text-sm text-muted-foreground flex gap-2">
                    <Quote size={16} className="text-muted shrink-0 mt-0.5" />
                    <p className="line-clamp-3">{snippet}</p>
                </div>
            )}
        </a>
    );
};
