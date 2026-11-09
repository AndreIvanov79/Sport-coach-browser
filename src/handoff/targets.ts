/**
 * Telegram bots (and "bot/app" Mini Apps) the analyzer may send a summary back to (coach-lite SPEC, 6.1).
 * A link with any other `ret` opens the analyzer in its normal mode, so a foreign link cannot collect summaries.
 */
export const RETURN_TARGETS: readonly string[] = ["coach_desk_lite_bot"];
