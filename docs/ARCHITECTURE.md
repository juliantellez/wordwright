# Architecture

Three files in this repository touch the outside world. Everything else is a function from
values to values, which is the only reason a typing trainer, a thing made entirely of
keystrokes and clocks, has a test suite that runs in under a tenth of a second.

That is the whole design. The rest of this document is where the line sits and what it
buys.

## The shape

```mermaid
flowchart TB
  subgraph edge["the edge: the only code that knows the world exists"]
    CLI["cli.ts (arguments, printing commands)"]
    APP["tui/app.ts (raw mode, the clock, the loop)"]
    LOAD["exercises/load.ts (reads pack files)"]
    STORE["store/progress.ts (reads and writes history)"]
  end

  subgraph core["the core: values in, values out"]
    TYPES["types.ts (the contracts)"]
    TYPING["engine/typing.ts (keystrokes, speed, accuracy)"]
    COMPOSE["engine/compose.ts (grading a sentence)"]
    SELECT["engine/select.ts (what you practise next)"]
    STATS["stats.ts (streaks, trends, weakest tags)"]
    RENDER["tui/render.ts (screens as string arrays)"]
    KEYS["tui/keys.ts (bytes to key names)"]
    THEME["tui/theme.ts (colour, wrapping, widths)"]
  end

  CLI --> LOAD
  CLI --> STORE
  CLI --> STATS
  CLI --> RENDER
  CLI --> APP
  APP --> TYPING
  APP --> COMPOSE
  APP --> SELECT
  APP --> STORE
  APP --> RENDER
  APP --> KEYS
  RENDER --> THEME
  RENDER --> STATS
  STATS --> SELECT
```

Nothing in the core imports `node:anything`. No renderer writes to standard output, no
grader reads a file, and every function that cares what time it is takes the time as an
argument. `tui/app.ts` owns the terminal, the clock and the loop, and it is the one file
you cannot unit test.

## A drill, from keystroke to stored attempt

```mermaid
sequenceDiagram
  participant You
  participant App as tui/app.ts
  participant Keys as tui/keys.ts
  participant Typing as engine/typing.ts
  participant Render as tui/render.ts
  participant Store as store/progress.ts

  You->>App: a burst of bytes on standard input
  App->>Keys: parseKeys(chunk)
  Keys-->>App: one key per press, arrows kept whole
  App->>Typing: applyKey(state, key, now)
  Typing-->>App: a new state, nothing mutated
  App->>Render: renderDrill(state, metrics)
  Render-->>App: an array of lines
  App->>You: one write, repainted from the top
  Note over App,Typing: a timer repaints every 120ms so the speed reads live
  App->>Typing: isComplete(state)?
  Typing-->>App: yes
  App->>Store: record(attempt)
```

Typing fast means several characters arrive in one chunk, and an arrow key arrives as
three bytes that must not be read as somebody typing a bracket. That is why parsing is its
own pure function: a test can drive an entire session without a terminal.

## The session loop

```mermaid
stateDiagram-v2
  [*] --> Menu: no level or mode given
  Menu --> Exercise: chosen
  [*] --> Exercise: level and mode given as flags

  Exercise --> Drill: mode is drill
  Exercise --> Compose: mode is compose

  Drill --> Result: last character typed
  Compose --> Grade: enter pressed

  Result --> Exercise: space, next one
  Result --> Drill: r, same one again
  Grade --> Exercise: space, next one
  Grade --> Compose: r, same one again

  Exercise --> Summary: queue empty
  Drill --> Summary: escape
  Compose --> Summary: escape
  Summary --> [*]
```

Retrying does not move the queue on, and the attempt you already finished is still
recorded. It happened, so it counts.

## How a composed sentence is graded

```mermaid
flowchart LR
  A["your sentence"] --> M["mechanics: capital, stop, spacing, no dashes"]
  A --> C["the exercise's own checks"]
  C --> C1["requires_word"]
  C --> C2["requires_pattern"]
  C --> C3["forbids_pattern"]
  C --> C4["min_words and max_words"]
  C1 --> S["score: the share of checks passed"]
  C2 --> S
  C3 --> S
  C4 --> S
  M --> K["clean: every check passed and the mechanics hold"]
  S --> K
```

The two layers are kept apart on purpose. Mechanics hold for any sentence anyone writes
and they are not what you are being scored on. The checks are the lesson, and each one
fails with a hint written as a fix rather than as a verdict.

There is no model in the loop. Every verdict is a rule sitting in a pack file, which is
what makes the feedback instant, repeatable, and available on a train.

## What you get next

```mermaid
flowchart TB
  H["your attempt history"] --> Q["quality per attempt: accuracy and speed, or checks passed"]
  Q --> M["mastery per focus tag, newest attempts weighted highest"]
  M --> P["priority per exercise: 1 minus the mean mastery of its tags"]
  P --> A1["never attempted: pushed up"]
  P --> A2["done in the last hour: pushed down hard"]
  P --> A3["a little jitter, so it is not the same three sentences"]
  A1 --> Sort["sorted, then the top N become the queue"]
  A2 --> Sort
  A3 --> Sort
```

A trainer that serves random sentences trains what you are already good at. This one
scores every focus tag from your history and leans towards the ones you are worst at. The
jitter and the recency penalty exist so that leaning does not turn into a punishment loop.

## Where the data lives

```mermaid
flowchart LR
  P1["data/*.json (ships with the package)"] --> L["exercises/load.ts"]
  P2["~/.wordwright/packs/*.json (yours)"] --> L
  L --> LIB["a validated library, plus a list of what it refused"]
  LIB --> SEL["engine/select.ts"]
  HIST["~/.wordwright/progress.json"] --> SEL
  SEL --> Q["the session queue"]
  Q --> ATT["attempts"]
  ATT --> HIST
  HIST --> ST["stats.ts, derived at read time"]
```

Progress is an append only list of attempts. Every number the tool shows, the streak, the
best speed, the worst keys, the mastery of a tag, is derived from that list when you ask
for it. There is no cached total to go stale and no migration when a new statistic is
added.

A pack that does not validate is skipped and named by `wordwright packs`. One typo costs
you one exercise, never the run.

## The boundaries, and the test that holds them

`src/boundaries.test.ts` asserts the claims this document makes, so the document cannot
quietly stop being true:

- no file in the core imports a `node:` module
- only `cli.ts`, `tui/app.ts` and the one environment variable read in `exercises/load.ts`
  touch the `process` global
- only `cli.ts` and `tui/app.ts` read the clock without being handed the time

If you move something across the line, that test fails and this page needs editing. That
is the point of it.

## Extending it

**A new exercise** is a JSON object in a pack file. No code, no release. The readme
documents the format and `wordwright template` prints a skeleton.

**A new kind of check** is three edits: the union in `types.ts`, a case in `runCheck` in
`engine/compose.ts`, and a case in `validateCheck` in `exercises/load.ts`. TypeScript will
name all three for you if you add the variant first, because every switch over the union
is exhaustive.

**A new screen** is a function in `tui/render.ts` returning `string[]`, and a call in
`tui/app.ts`. Renderers take a `Frame` carrying the width and a `plain` flag, so every
screen has a colourless twin that a test can assert on.

**A new statistic** is a function in `stats.ts` over the attempt list. Nothing is stored,
so nothing needs migrating.

## Known rough edges

`store/progress.ts` imports `homeDir` from `exercises/load.ts`, which puts a path concern
in the wrong module and makes the store depend on the loader for no good reason. It works
and it is one function, so it has not been worth a change yet. If a third module ever
needs that path, it should move somewhere of its own.

The compose grader matches patterns, so it can be satisfied by a sentence that obeys the
letter of the exercise and means nothing. It catches the mistakes you repeat. It cannot
tell you the sentence is good.
