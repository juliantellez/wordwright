#!/usr/bin/env -S node --experimental-strip-types --disable-warning=ExperimentalWarning
//
// wordwright: type faster, and write better while you do it.
//
// Usage:
//   wordwright                     pick a level and a mode, then practise
//   wordwright drill [options]     type sentences, measured in words per minute
//   wordwright compose [options]   write to a brief, graded on grammar and intent
//   wordwright stats               speed, accuracy, streak, and your weakest patterns
//   wordwright packs               every pack loaded, and anything that failed to load
//   wordwright add <file.json>     install a pack of your own from a file
//   wordwright template            print a pack skeleton you can fill in
//
// Options:
//   --level <beginner|intermediate|advanced>   default: asked, or your weakest
//   --count <n>                                exercises in the session (default 8)
//   --plain                                    no colour and no alternate screen
//
// Your history lives in ~/.wordwright/progress.json. Your own packs live in
// ~/.wordwright/packs/. Nothing leaves the machine and nothing is fetched.
//

import fs from "node:fs";
import path from "node:path";
import { LEVELS } from "./types.ts";
import type { Level, Mode } from "./types.ts";
import { builtinPackDir, loadLibrary, userPackDir, validatePack } from "./exercises/load.ts";
import { load as loadProgress } from "./store/progress.ts";
import { summarise, tagReport, wpmTrend } from "./stats.ts";
import { renderStats, usableWidth } from "./tui/render.ts";
import { run } from "./tui/app.ts";
import { DIM, GREEN, RED, paint, row } from "./tui/theme.ts";

interface Args {
  command: string;
  rest: string[];
  level?: Level;
  count: number;
  plain: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = { command: "", rest: [], count: 8, plain: false, help: false };
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index] ?? "";
    if (item === "--help" || item === "-h") args.help = true;
    else if (item === "--plain") args.plain = true;
    else if (item === "--level" || item === "-l") {
      const value = argv[index + 1] ?? "";
      if ((LEVELS as readonly string[]).includes(value)) args.level = value as Level;
      index += 1;
    } else if (item === "--count" || item === "-n") {
      const value = Number(argv[index + 1] ?? "");
      if (Number.isFinite(value) && value > 0) args.count = Math.floor(value);
      index += 1;
    } else if (!item.startsWith("-")) {
      positional.push(item);
    }
  }

  args.command = positional[0] ?? "";
  args.rest = positional.slice(1);
  return args;
}

function usage(): string {
  const source = fs.readFileSync(new URL(import.meta.url), "utf8");
  const lines = source.split("\n");
  const start = lines.findIndex((line) => line.startsWith("// wordwright:"));
  const body: string[] = [];
  for (const line of lines.slice(start)) {
    if (!line.startsWith("//")) break;
    body.push(line.replace(/^\/\/ ?/, ""));
  }
  return body.join("\n");
}

function commandStats(plain: boolean): void {
  const progress = loadProgress();
  const frame = { width: usableWidth(process.stdout.columns ?? 80), plain };
  const lines = renderStats(
    {
      summary: summarise(progress.attempts, Date.now()),
      trend: wpmTrend(progress.attempts),
      tags: tagReport(progress.attempts),
      attempts: progress.attempts,
    },
    frame,
  );
  process.stdout.write(`${lines.join("\n")}\n`);
}

function commandPacks(plain: boolean): void {
  const library = loadLibrary();
  const lines: string[] = [""];

  for (const level of LEVELS) {
    const packs = library.packs.filter((pack) => pack.level === level);
    if (packs.length === 0) continue;
    lines.push(
      ...row(
        level,
        packs.map((pack) => {
          const drills = pack.exercises.filter((exercise) => exercise.mode === "drill").length;
          const composes = pack.exercises.length - drills;
          return `${pack.pack} v${pack.version}  ${paint(`${drills} drills, ${composes} compose`, DIM, plain)}`;
        }),
        "",
        plain,
      ),
    );
  }

  lines.push("");
  lines.push(...row("built in", [builtinPackDir()], DIM, plain));
  lines.push(...row("yours", [userPackDir()], DIM, plain));

  if (library.problems.length > 0) {
    lines.push("");
    lines.push(
      ...row(
        "skipped",
        library.problems.map((problem) => `${path.basename(problem.source)}: ${problem.reason}`),
        RED,
        plain,
      ),
    );
  }

  process.stdout.write(`${lines.join("\n")}\n`);
}

function commandAdd(file: string | undefined, plain: boolean): number {
  if (!file) {
    process.stderr.write("Give me a pack file: wordwright add my-pack.json\n");
    return 1;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    process.stderr.write(`Could not read ${file}: ${(error as Error).message}\n`);
    return 1;
  }

  const result = validatePack(parsed, file);
  if (typeof result === "string") {
    process.stderr.write(`That pack does not load: ${result}\n`);
    return 1;
  }
  for (const problem of result.problems) {
    process.stderr.write(`${paint("skipped", RED, plain)} ${problem.reason}\n`);
  }
  if (result.pack.exercises.length === 0) {
    process.stderr.write("Nothing in that pack survived validation, so it was not installed.\n");
    return 1;
  }

  fs.mkdirSync(userPackDir(), { recursive: true });
  const destination = path.join(userPackDir(), path.basename(file));
  fs.copyFileSync(file, destination);
  process.stdout.write(
    `${paint("installed", GREEN, plain)} ${result.pack.pack}: ${result.pack.exercises.length} exercises at ${destination}\n`,
  );
  return 0;
}

const TEMPLATE = {
  pack: "my-pack",
  version: 1,
  level: "intermediate",
  exercises: [
    {
      id: "my-pack-1",
      mode: "drill",
      text: "The engineer read the log, found the timeout, and shipped the fix before lunch.",
      focus: ["parallel-structure", "commas"],
      lesson: {
        title: "Three verbs in a row take the same shape",
        explain:
          "Read, found and shipped are all past tense and all belong to the same subject. When one item in a list changes shape, the sentence stumbles.",
      },
    },
    {
      id: "my-pack-2",
      mode: "compose",
      prompt: "Rewrite this so the subject does the acting.",
      starter: "The outage was caused by a expired certificate.",
      checks: [
        {
          kind: "forbids_pattern",
          pattern: "\\b(was|were|is|are|been)\\s+\\w+ed\\b",
          hint: "Still passive. Put whoever or whatever did it in front of the verb.",
        },
        { kind: "max_words", count: 12, hint: "Active voice should come out shorter. Cut it to twelve words." },
      ],
      model: "An expired certificate caused the outage.",
      focus: ["active-voice"],
      lesson: {
        title: "Active voice names the actor",
        explain:
          "Passive voice hides who did the thing, which is useful when you do not know and evasive when you do. Name the actor and the sentence gets shorter.",
      },
    },
  ],
};

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const plain = args.plain || !process.stdout.isTTY;

  if (args.help || args.command === "help") {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }

  switch (args.command) {
    case "stats":
      commandStats(plain);
      return 0;
    case "packs":
      commandPacks(plain);
      return 0;
    case "add":
      return commandAdd(args.rest[0], plain);
    case "template":
      process.stdout.write(`${JSON.stringify(TEMPLATE, null, 2)}\n`);
      return 0;
    case "":
    case "drill":
    case "compose":
      break;
    default:
      process.stderr.write(`Unknown command "${args.command}". Try wordwright --help.\n`);
      return 1;
  }

  const library = loadLibrary();
  if (library.exercises.length === 0) {
    process.stderr.write("No exercises loaded. Run `wordwright packs` to see what went wrong.\n");
    return 1;
  }

  if (!process.stdin.isTTY) {
    process.stderr.write("Practice needs an interactive terminal. Try `wordwright stats` instead.\n");
    return 1;
  }

  const mode: Mode | undefined = args.command === "" ? undefined : (args.command as Mode);
  await run({
    exercises: library.exercises,
    ...(args.level !== undefined ? { level: args.level } : {}),
    ...(mode !== undefined ? { mode } : {}),
    count: args.count,
    plain: args.plain,
  });
  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    process.stderr.write(`${(error as Error).stack ?? String(error)}\n`);
    process.exitCode = 1;
  });
