# wordwright

A terminal typing trainer that makes you type the sentence, then tells you why the sentence is built that way.

Most typing tutors feed you scrambled words or a paragraph lifted from a novel. You get faster at hitting keys and you learn nothing else. Every sentence in wordwright is chosen to teach one thing: a semicolon that joins two whole sentences, an appositive that defines a noun in passing, the difference between fewer and less. You type it, you see your speed, and then you get two or three sentences explaining the pattern you just typed.

Then it asks you to write one yourself.

```
  wordwright                                        intermediate  ·  drill 3/8
  ────────────────────────────────────────────────────────────────────────────

  ▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░   58 wpm   97% accurate   3.0s

  The deploy finished at two; nobody noticed until the morning.

  semicolon · clause-joining

  esc quit    ctrl+r restart    tab skip
```

## Running it

Needs Node 22.18 or newer. There is no build step and there are no runtime dependencies.

```sh
git clone https://github.com/juliantellez/wordwright.git
cd wordwright
./src/cli.ts
```

Or install it so the command is on your path:

```sh
npm install -g .
wordwright
```

```
wordwright                     pick a level and a mode, then practise
wordwright drill               type sentences, measured in words per minute
wordwright compose             write to a brief, graded on grammar and intent
wordwright stats               speed, accuracy, streak, and your weakest patterns
wordwright packs               every pack loaded, and anything that failed to load
wordwright add my-pack.json    install a pack of your own
wordwright template            print a pack skeleton to fill in

  --level <beginner|intermediate|advanced>
  --count <n>       exercises in the session, default 8
  --plain           no colour, no alternate screen
```

## The two modes

**Drill** measures speed. You type the sentence exactly. Correct characters stay bright, wrong ones go red and stay on screen rather than being rejected, and the caret sits on the character you owe next. Speed is net words per minute, where a word is five characters and every character you leave wrong costs you one. Backspace works, and correcting a mistake still shows up in accuracy, because it happened.

**Compose** measures writing. You get a brief and you write your own sentence. It is graded on two layers that are kept apart on purpose. Mechanics are the rules that hold for anything you write: it opens with a capital, it closes with a stop, punctuation sits against the word in front of it. The exercise checks are the actual lesson, and each one fails with a hint that tells you what to do rather than what you did.

```
  score      ▓▓▓▓▓▓▓▓▓▓▓░░░░░  2/3 checks

  yours      the outage was caused by an expired certificate

  checks     ✗ Still passive. Put the actor in front of the verb: something
               did something.
             ✓ 12 words or fewer
             ✓ used "certificate"

  mechanics  Open with a capital letter.

  one way    An expired certificate caused the outage.
```

There is no model in the loop. Every verdict is a rule you can read in the pack file, which is what makes the feedback repeatable, instant, and usable with no network.

## What it picks next

Every exercise carries focus tags: `semicolon`, `active-voice`, `its-vs-its`, `rhythm`. Each attempt you finish scores those tags, and the next session leans towards the ones you are worst at and the exercises you have not seen in a while. An exercise you did in the last hour is pushed down hard, so it stays practice rather than punishment.

Your history is a single file at `~/.wordwright/progress.json`. Every number the tool shows is derived from it at read time, so nothing goes stale and nothing is sent anywhere.

## Levels

**Beginner** is the ground you stand on: its and it's, their and there, subject and verb agreement, apostrophes, the comma before and, and the reach keys most people slow down on.

**Intermediate** is the joins: semicolons, comma splices, restrictive and non restrictive clauses, active voice, parallel structure, dangling modifiers, and cutting the phrases that carry no weight.

**Advanced** is rhythm and precision: the subjunctive, appositives, periodic and cumulative sentences, the short sentence that lands after a long one, removing hedges, and words like salient, obviate and perfunctory that compress a whole clause into one word.

## Writing your own exercises

A pack is JSON. Drop one in `~/.wordwright/packs/` and it loads on the next run. Start from `wordwright template`.

```json
{
  "pack": "my-pack",
  "version": 1,
  "level": "intermediate",
  "exercises": [
    {
      "id": "my-pack-1",
      "mode": "drill",
      "text": "She read the logs, found the timeout, and shipped the fix before lunch.",
      "focus": ["parallel-structure"],
      "lesson": {
        "title": "Items in a list take the same shape",
        "explain": "Read, found and shipped are all past tense and all belong to the same subject. The moment one item changes shape, the sentence stumbles."
      }
    }
  ]
}
```

A compose exercise adds a `prompt`, an optional `starter`, a `model` answer and a list of `checks`. There are five kinds of check, and each one carries the hint you see when it fails:

```json
{ "kind": "requires_word",    "word": "certificate", "hint": "Keep the certificate, it is the actor." }
{ "kind": "requires_pattern", "pattern": ",\\s*which\\b", "hint": "An added clause opens with a comma." }
{ "kind": "forbids_pattern",  "pattern": "\\bwas \\w+ed\\b", "hint": "Still passive." }
{ "kind": "min_words",        "count": 8,  "hint": "Give the word something to do." }
{ "kind": "max_words",        "count": 12, "hint": "Active voice comes out shorter." }
```

Patterns are ordinary regular expressions, matched case insensitively. `requires_word` matches the ordinary inflections too, so asking for `elide` is satisfied by `elides` and `eliding`.

Run `wordwright add my-pack.json` to validate a pack before installing it. A pack that does not validate is skipped and named by `wordwright packs`, so a typo costs you one exercise rather than the run.

The test suite checks something worth stealing: every model answer in every shipped pack has to pass its own checks. An exercise whose own answer would be marked wrong is a bug, and it is caught before it reaches you.

## What it does not do

It does not know whether your sentence is good. It knows whether it is passive, whether it used the word, whether it stayed under twelve words, and whether the mechanics hold. That is a long way short of a human editor and it is enough to fix the mistakes you actually repeat.

It does not do multi paragraph writing, and it will not teach you to type if you have never touched a keyboard. Learn the home row somewhere else first, then come back.

The corpus is currently 81 exercises. That is enough for weeks of daily practice and it is nowhere near enough forever, which is why the pack format is the first thing documented.

## Tests

```sh
npm test          # 127 tests, node's own runner, no framework
npm run typecheck # strict typescript, no any
npm run build     # compile to dist/, which is what gets published
```

## Releasing

The repository runs on TypeScript with no build step, because Node strips the types for
you. That stops working the moment the package is installed: Node refuses to strip types
for anything under `node_modules`, so a published package has to ship JavaScript.

So `npm run build` compiles `src/` to `dist/`, and `dist/cli.js` is what the `wordwright`
command points at. The `.ts` import extensions are rewritten to `.js` on the way out, and
the shebang loses its type stripping flags.

Publishing happens in CI, never from a laptop. Push a tag and the release workflow checks
the tag against `package.json`, runs the tests, builds, installs the packed tarball,
runs the command for real, and only then publishes with provenance.

```sh
npm version patch     # or minor, or major
git push origin main --follow-tags
```

CI installs the built tarball on Node 20, 22 and 24, on Linux and macOS, and runs the
command. That job exists because the first version of this package shipped TypeScript and
would have failed on every machine that installed it.

MIT.
