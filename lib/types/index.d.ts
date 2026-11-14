import type { Context } from "@deepseek-ai/cordis";

/** Stable cordis plugin name. */
export declare const name: string;

/** Services required at activation. */
export declare const inject: string[];

/**
 * Register the desktop-control tools and the system-prompt guidance section.
 * Throws a descriptive error if this DSH version does not expose the
 * ctx.tools / ctx.systemPrompt seams the plugin targets.
 */
export declare function apply(ctx: Context, config?: Record<string, unknown>): void;
//# sourceMappingURL=index.d.ts.map
