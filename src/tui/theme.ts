//
// Colour, spacing and the two or three drawing characters this uses.
//
// Everything renders through `paint`, which takes a `plain` flag, so every screen has a
// colourless twin. That is what makes the renderers testable and what makes the output
// readable when it is piped somewhere.
//

/** Built from the code point, so no raw escape byte is pasted into this file. */
export const ESC = String.fromCharCode(27) + "[";

export const RESET = `${ESC}0m`;
export const DIM = `${ESC}2m`;
export const BOLD = `${ESC}1m`;
export const UNDERLINE = `${ESC}4m`;
export const REVERSE = `${ESC}7m`;
export const RED = `${ESC}31m`;
export const GREEN = `${ESC}32m`;
export const YELLOW = `${ESC}33m`;
export const BLUE = `${ESC}34m`;
export const MAGENTA = `${ESC}35m`;
export const CYAN = `${ESC}36m`;
export const GREY = `${ESC}90m`;
export const ON_RED = `${ESC}41m`;

export const ALT_SCREEN_ON = `${ESC}?1049h`;
export const ALT_SCREEN_OFF = `${ESC}?1049l`;
export const CURSOR_HIDE = `${ESC}?25l`;
export const CURSOR_SHOW = `${ESC}?25h`;
export const CLEAR = `${ESC}2J${ESC}H`;

export function paint(text: string, colour: string, plain: boolean): string {
  if (plain || colour === "") return text;
  return colour + text + RESET;
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;?]*[a-zA-Z]`, "g");

/** Printable width, with escape sequences taken out. */
export function width(text: string): number {
  return text.replace(ANSI, "").length;
}

export function padTo(text: string, size: number): string {
  const gap = size - width(text);
  return gap > 0 ? text + " ".repeat(gap) : text;
}

export function centre(text: string, size: number): string {
  const gap = Math.max(0, size - width(text));
  const left = Math.floor(gap / 2);
  return " ".repeat(left) + text;
}

export const LABEL_WIDTH = 11;

/** The hub's gutter row: a dim label on the left, content on the right. */
export function row(label: string, lines: string[], colour: string, plain: boolean): string[] {
  if (lines.length === 0) return [];
  // A long label widens its own gutter rather than colliding with the content.
  const gutter = Math.max(LABEL_WIDTH, label.length + 2);
  return lines.map((line, index) => {
    const tag = (index === 0 ? label : "").padEnd(gutter);
    return "  " + paint(tag, DIM, plain) + paint(line, colour, plain);
  });
}

export function bar(fraction: number, size = 24): string {
  const safe = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const filled = Math.round(safe * size);
  return "▓".repeat(filled) + "░".repeat(Math.max(0, size - filled));
}

export function rule(size: number): string {
  return "─".repeat(Math.max(0, size));
}

/**
 * Wraps to a width without breaking words, and reports the index each line starts at, so
 * the drill screen can colour characters after wrapping without re-deriving positions.
 */
export function wrapWithOffsets(text: string, size: number): { line: string; start: number }[] {
  const out: { line: string; start: number }[] = [];
  if (size <= 0) return [{ line: text, start: 0 }];

  let start = 0;
  while (start < text.length) {
    if (text.length - start <= size) {
      out.push({ line: text.slice(start), start });
      break;
    }
    let end = start + size;
    const lastSpace = text.lastIndexOf(" ", end);
    if (lastSpace > start) end = lastSpace + 1; // keep the space on the line it belongs to
    out.push({ line: text.slice(start, end), start });
    start = end;
  }
  return out.length > 0 ? out : [{ line: "", start: 0 }];
}

export function percent(fraction: number): string {
  return `${Math.round((Number.isFinite(fraction) ? fraction : 0) * 100)}%`;
}

export function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
