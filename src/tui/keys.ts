//
// Turning what the terminal sends into keys.
//
// Typing fast means several characters arrive in one chunk, and an arrow key arrives as
// three bytes that must not be mistaken for someone typing a bracket. Parsing is pure
// and takes a string, which is what lets a test drive a whole session without a tty.
//

export type KeyName =
  | "char"
  | "enter"
  | "escape"
  | "backspace"
  | "tab"
  | "up"
  | "down"
  | "left"
  | "right"
  | "interrupt"
  | "clear-line"
  | "restart"
  | "unknown";

export interface Key {
  name: KeyName;
  /** The character, for `char` keys. Empty otherwise. */
  char: string;
}

const ESCAPE = String.fromCharCode(27);
const DELETE = String.fromCharCode(127);

export function parseKeys(chunk: string): Key[] {
  const keys: Key[] = [];
  let index = 0;

  while (index < chunk.length) {
    const character = chunk[index] ?? "";

    if (character === ESCAPE) {
      const next = chunk[index + 1];
      if (next === "[" || next === "O") {
        const final = chunk[index + 2] ?? "";
        const named: Record<string, KeyName> = { A: "up", B: "down", C: "right", D: "left" };
        keys.push({ name: named[final] ?? "unknown", char: "" });
        index += 3;
        continue;
      }
      keys.push({ name: "escape", char: "" });
      index += 1;
      continue;
    }

    switch (character) {
      case "\r":
      case "\n":
        keys.push({ name: "enter", char: "" });
        break;
      case "\t":
        keys.push({ name: "tab", char: "" });
        break;
      case DELETE:
      case "\b":
        keys.push({ name: "backspace", char: "" });
        break;
      case String.fromCharCode(3):
        keys.push({ name: "interrupt", char: "" });
        break;
      case String.fromCharCode(21):
        keys.push({ name: "clear-line", char: "" });
        break;
      case String.fromCharCode(18):
        keys.push({ name: "restart", char: "" });
        break;
      default: {
        const code = character.codePointAt(0) ?? 0;
        if (code < 32) keys.push({ name: "unknown", char: "" });
        else keys.push({ name: "char", char: character });
      }
    }
    index += 1;
  }

  return keys;
}

export function isQuit(key: Key): boolean {
  return key.name === "escape" || key.name === "interrupt";
}
