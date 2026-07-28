# Interview Question Practice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and integrate a broad, role-tailored, browser-only interview practice application with library, guided practice, mock interview, and local progress.

**Architecture:** A static vanilla HTML/CSS/JavaScript app under `generators/interview-practice`. Content is split into core question and role-pack modules; a pure engine module performs matching and session generation; the UI module owns state, rendering, timers, and storage.

**Tech Stack:** HTML5, modern CSS, vanilla JavaScript, browser `localStorage`, Node's built-in test runner where available.

## Global Constraints

- No backend, account, API key, framework, or build step.
- Custom job titles must always be accepted.
- Personal data remains on the user's device.
- The app must work standalone and in the homepage iframe using `?embed=1`.
- Content and code stay modular; no single multi-thousand-line application file.
- Homepage card appears immediately after CV / Resume Generator.

---

### Task 1: Pure personalization engine

**Files:**
- Create: `generators/interview-practice/js/engine.js`
- Create: `generators/interview-practice/tests/engine.test.js`

**Interfaces:**
- Produces `InterviewEngine.normalizeText(value)`
- Produces `InterviewEngine.matchRoleFamilies(role, rolePacks)`
- Produces `InterviewEngine.extractKeywords(jobDescription)`
- Produces `InterviewEngine.filterQuestions(questions, filters)`
- Produces `InterviewEngine.generateSession(options)`
- Produces `InterviewEngine.summarizeProgress(history)`

- [ ] Write failing tests for role matching, keyword extraction, filters, deduplication, seeded balanced sessions, and progress summaries.
- [ ] Run `node --test generators/interview-practice/tests/engine.test.js` and verify failures because `engine.js` does not exist.
- [ ] Implement the pure engine API with deterministic seeded shuffling and balanced category selection.
- [ ] Re-run the test file and verify all tests pass.

### Task 2: Curated modular content

**Files:**
- Create: `generators/interview-practice/data/core-questions.js`
- Create: `generators/interview-practice/data/role-packs.js`
- Create: `generators/interview-practice/data/answer-guides.js`
- Create: `generators/interview-practice/tests/content.test.js`

**Interfaces:**
- Produces global `INTERVIEW_CORE_QUESTIONS`
- Produces global `INTERVIEW_ROLE_PACKS`
- Produces global `INTERVIEW_ANSWER_GUIDES`

- [ ] Write a failing content validation test requiring unique IDs, required fields, valid categories/difficulties, 15+ role families, and 180+ questions after expansion.
- [ ] Run the test and verify it fails because data modules do not exist.
- [ ] Add universal questions, domain templates, family terminology, and answer frameworks.
- [ ] Re-run the test and verify all records are valid and coverage thresholds pass.

### Task 3: Application shell and responsive styling

**Files:**
- Create: `generators/interview-practice/index.html`
- Create: `generators/interview-practice/css/style.css`

**Interfaces:**
- Consumes the content globals and `InterviewEngine`.
- Provides stable DOM IDs used by `app.js`.

- [ ] Create a semantic application shell with setup, mode navigation, library, practice, mock, coach, progress, and confirmation dialog sections.
- [ ] Add responsive desktop/tablet/mobile layouts, focus states, reduced-motion handling, and embed compatibility.
- [ ] Validate that every form control has an accessible label and all mode buttons expose selected state.

### Task 4: UI state, practice, and persistence

**Files:**
- Create: `generators/interview-practice/js/app.js`

**Interfaces:**
- Consumes `InterviewEngine`, `INTERVIEW_CORE_QUESTIONS`, `INTERVIEW_ROLE_PACKS`, and `INTERVIEW_ANSWER_GUIDES`.
- Stores state under `gaelle-interview-practice-v1`.

- [ ] Implement setup and role-tailored question pool generation.
- [ ] Implement paginated library search, filters, favorites, and answer disclosures.
- [ ] Implement guided practice with drafts, STAR fields, model answers, ratings, and notes.
- [ ] Implement mock interview timer, question navigation, completion review, and progress history.
- [ ] Implement autosave, restoration, reset confirmation, toasts, and live announcements.

### Task 5: Homepage integration

**Files:**
- Modify: `index.html`
- Modify: `css/site.css`

**Interfaces:**
- Reuses existing `project-card` and iframe launcher behavior.

- [ ] Add project `04` immediately after CV / Resume Generator with `data-src="generators/interview-practice/index.html"`.
- [ ] Add `.project-media--interview` artwork styling.
- [ ] Increase the tools-shipped count from 3 to 4 and bump the homepage CSS cache key.

### Task 6: Verification

**Files:**
- Verify all files under `generators/interview-practice/`
- Verify modified `index.html` and `css/site.css`

- [ ] Run all engine/content tests.
- [ ] Read IDE lints for all changed files and fix new diagnostics.
- [ ] Open the homepage, launch project 04, and verify iframe loading.
- [ ] Exercise custom role, filters, answer reveal, guided practice, mock timer, favorites, and persistence.
- [ ] Verify desktop and mobile layouts visually and confirm no console errors.

## Self-Review

- Spec coverage: all approved capabilities map to Tasks 1–6.
- Placeholder scan: no implementation placeholders remain.
- Type consistency: engine and data global names are stable across tasks.
- Scope: backend AI generation and literal billion-word storage remain explicitly excluded.
