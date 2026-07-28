# Interview Question Practice Design

## Goal

Add a free, browser-only interview practice application under `02 · Projects`, immediately after the CV / Resume Generator. It must support broad role coverage, custom roles, job-description tailoring, guided learning, realistic mock interviews, editable model answers, and local progress tracking without requiring an account or backend.

## Scope

The first release is a large curated and generative client-side practice system, not a literal two-billion-word database. A static website cannot ship or search that volume efficiently. Instead, the app combines reusable competency questions, role-family question packs, answer frameworks, and job-description keywords to produce a large number of relevant practice sessions while staying fast.

## User Experience

The app opens with a compact setup area:

- Free-text target role with suggestions spanning NGO/UN, administration, finance, technology, healthcare, education, marketing, operations, legal, creative, and leadership roles.
- Optional pasted job description.
- Experience level: entry, mid, senior, manager/executive.
- Interview focus: mixed, behavioral, situational, technical, competency, leadership, HR/motivation.
- Session length: 5, 10, 15, or 20 questions.

The primary workspace has three modes:

1. **Question Library** — searchable and filterable questions with expandable model answers, answer guidance, follow-up questions, difficulty, and role relevance.
2. **Guided Practice** — one question at a time, with a STAR answer workspace, hints, editable draft, model answer reveal, self-rating, notes, and next-question navigation.
3. **Mock Interview** — timed question flow with no model answer until the session ends, then a review screen with ratings, notes, and recommended areas to improve.

## Content Architecture

Content is split into focused JavaScript modules:

- `data/core-questions.js`: universal behavioral, situational, motivation, strengths, conflict, teamwork, ethics, failure, communication, and adaptability questions.
- `data/role-packs.js`: domain questions and terminology by role family.
- `data/answer-guides.js`: STAR, PREP, technical explanation, case-response, leadership, and motivation frameworks.
- `js/engine.js`: normalization, role-family matching, keyword extraction, question scoring, deduplication, session generation, filtering, and model-answer assembly.
- `js/app.js`: rendering, navigation, timers, local storage, accessibility states, and user events.

Question objects include:

- stable `id`
- `question`
- `category`
- `difficulty`
- applicable `levels`
- applicable `families`
- `whyAsked`
- `answerPlan`
- `modelAnswer`
- `followUps`
- `keywords`

The initial library should cover at least 15 role families and at least 180 curated question records. Role-family matching and job-description keyword adaptation expand the number of relevant session combinations substantially without duplicating content.

## Personalization

The engine:

- Matches a free-text role to one or more role families.
- Extracts useful words and known phrases from a pasted vacancy.
- Prioritizes questions whose role family, category, level, and keywords match.
- Adds a tailored prompt that asks the user to connect an answer to the vacancy where appropriate.
- Produces a balanced session rather than returning only one category.

No generated answer is presented as universally correct. Guidance reminds users to replace sample details with truthful personal examples.

## Persistence

`localStorage` stores:

- setup preferences
- favorites
- personal notes
- draft answers
- question ratings
- completed sessions
- recent progress totals

The app provides a single “Reset progress” action with confirmation.

## Visual Design

Use the site’s Fraunces/Outfit typography and brand tokens, with a warm professional palette:

- dark navy shell
- cream cards
- sea-blue primary actions
- gold accents
- green progress states

Desktop uses a broad three-area workspace: compact navigation rail, main practice content, and contextual coach panel. Tablet collapses the coach under the main content. Mobile uses a bottom mode switch and single-column cards.

Avoid a large hero. The workspace should maximize usable vertical space and work well inside the existing project iframe.

## Accessibility

- Semantic headings, navigation, buttons, forms, and progress labels.
- Visible focus rings and keyboard-operable disclosures.
- `aria-live` for question/session changes and timer warnings.
- No meaning conveyed by color alone.
- Respect `prefers-reduced-motion`.
- Minimum comfortable tap targets on mobile.

## Performance

- No framework or external runtime dependency.
- Defer rendering large library result sets with pagination/load-more.
- Keep data modular and only render visible content.
- Cache computed role matching for the active setup.
- Avoid remote requests after font loading.

## Homepage Integration

- Add project number `04` after CV / Resume Generator.
- Add `project-media--interview` styling.
- Update shipped-tools count from 3 to 4.
- Reuse the existing iframe launcher; no homepage JavaScript changes.

## Verification

Automated unit tests cover:

- role-family matching
- keyword extraction
- category/level filtering
- deduplication
- balanced session generation
- deterministic seeded sessions
- progress summary calculations

Browser verification covers:

- homepage card opens the app in the workspace iframe
- custom role input and job description tailoring
- all three modes
- timer start/pause/finish
- answer saving and reload persistence
- favorites and filters
- responsive desktop/mobile layouts
- no console errors

## Constraints

- Static hosting only; no API key or account required.
- All user data remains in the browser.
- No claim of exhaustive or AI-generated factual authority.
- Live competitor research was unavailable because the Exa integration was not connected; the design is based on established interview-practice patterns and the repository’s existing conventions.
