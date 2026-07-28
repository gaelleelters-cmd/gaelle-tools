const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const coreQuestions = require("../data/core-questions.js");
const rolePacks = require("../data/role-packs.js");
const answerGuides = require("../data/answer-guides.js");

const VALID_CATEGORIES = new Set([
  "behavioral",
  "situational",
  "technical",
  "competency",
  "leadership",
  "motivation",
  "communication",
  "ethics",
]);
const VALID_DIFFICULTIES = new Set(["entry", "mid", "senior"]);
const VALID_LEVELS = new Set(["entry", "mid", "senior", "manager"]);

function validateQuestion(question, expectedFamily) {
  assert.match(question.id, /^[a-z0-9-]+$/);
  assert.ok(question.question.length >= 20, `${question.id} needs a meaningful question`);
  assert.ok(VALID_CATEGORIES.has(question.category), `${question.id} has an invalid category`);
  assert.ok(VALID_DIFFICULTIES.has(question.difficulty), `${question.id} has an invalid difficulty`);
  assert.ok(Array.isArray(question.levels) && question.levels.length > 0);
  assert.ok(question.levels.every((level) => VALID_LEVELS.has(level)));
  assert.ok(Array.isArray(question.families) && question.families.length > 0);
  if (expectedFamily) assert.ok(question.families.includes(expectedFamily));
  assert.ok(question.whyAsked.length >= 20, `${question.id} needs useful rationale`);
  assert.ok(Array.isArray(question.answerPlan) && question.answerPlan.length >= 3);
  assert.ok(question.answerPlan.every((step) => step.length >= 10));
  assert.ok(question.modelAnswer.length >= 100, `${question.id} needs a substantive model answer`);
  assert.ok(Array.isArray(question.followUps) && question.followUps.length >= 1);
  assert.ok(Array.isArray(question.keywords) && question.keywords.length >= 2);
}

test("core questions provide valid universal interview content", () => {
  assert.ok(coreQuestions.length >= 30);
  coreQuestions.forEach((question) => validateQuestion(question));
  assert.ok(coreQuestions.every(({ families }) => families.includes("universal")));
});

test("role packs cover all required career domains", () => {
  const requiredFamilies = [
    "ngo-un",
    "admin-operations",
    "finance",
    "data-research",
    "software-it",
    "product-design",
    "marketing-comms",
    "sales-customer-success",
    "healthcare",
    "education-training",
    "hr",
    "legal-compliance",
    "supply-logistics",
    "project-programme",
    "management-leadership",
  ];

  assert.ok(rolePacks.length >= 15);
  for (const family of requiredFamilies) {
    assert.ok(rolePacks.some(({ id }) => id === family), `Missing role family ${family}`);
  }
});

test("role packs include matching metadata and meaningful questions", () => {
  for (const pack of rolePacks) {
    assert.match(pack.id, /^[a-z0-9-]+$/);
    assert.ok(pack.name.length >= 2);
    assert.ok(Array.isArray(pack.aliases) && pack.aliases.length >= 4);
    assert.ok(Array.isArray(pack.keywords) && pack.keywords.length >= 5);
    assert.ok(Array.isArray(pack.questions) && pack.questions.length >= 10);
    pack.questions.forEach((question) => validateQuestion(question, pack.id));
  }
});

test("expanded library contains at least 180 unique question records", () => {
  const allQuestions = [
    ...coreQuestions,
    ...rolePacks.flatMap(({ questions }) => questions),
  ];
  const ids = allQuestions.map(({ id }) => id);
  const normalizedPrompts = allQuestions.map(({ question }) =>
    question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
  );

  assert.ok(allQuestions.length >= 180, `Only ${allQuestions.length} questions found`);
  assert.equal(new Set(ids).size, ids.length, "Question IDs must be unique");
  assert.equal(
    new Set(normalizedPrompts).size,
    normalizedPrompts.length,
    "Question prompts must be unique",
  );
});

test("model answers are semantically diverse and explicitly adaptable", () => {
  const allQuestions = [
    ...coreQuestions,
    ...rolePacks.flatMap(({ questions }) => questions),
  ];
  const normalizedAnswers = allQuestions.map(({ modelAnswer }) =>
    modelAnswer.toLowerCase().replace(/\s+/g, " ").trim(),
  );

  assert.equal(
    new Set(normalizedAnswers).size,
    normalizedAnswers.length,
    "Every question needs a distinct assembled model answer",
  );
  assert.ok(
    allQuestions.every(({ modelAnswer }) => /adapt|replace|your own|truthful/i.test(modelAnswer)),
    "Every model answer must clearly ask candidates to adapt the example truthfully",
  );
  for (const pack of rolePacks) {
    assert.equal(
      new Set(pack.questions.map(({ modelAnswer }) => modelAnswer)).size,
      pack.questions.length,
      `${pack.id} repeats boilerplate answers`,
    );
  }
});

test("data modules expose browser globals without leaking Node globals", () => {
  assert.equal(globalThis.INTERVIEW_CORE_QUESTIONS, undefined);
  assert.equal(globalThis.INTERVIEW_ROLE_PACKS, undefined);
  assert.equal(globalThis.INTERVIEW_ANSWER_GUIDES, undefined);

  const modules = [
    ["../data/core-questions.js", "INTERVIEW_CORE_QUESTIONS"],
    ["../data/role-packs.js", "INTERVIEW_ROLE_PACKS"],
    ["../data/answer-guides.js", "INTERVIEW_ANSWER_GUIDES"],
  ];
  for (const [relativePath, globalName] of modules) {
    const browserContext = {};
    const source = fs.readFileSync(path.join(__dirname, relativePath), "utf8");
    vm.runInNewContext(source, browserContext);
    assert.ok(Array.isArray(browserContext[globalName]), `${globalName} was not exposed`);
  }
});

test("answer guides expose complete, distinct frameworks", () => {
  const requiredGuides = ["star", "prep", "technical", "case-response", "leadership", "motivation"];

  assert.ok(Array.isArray(answerGuides));
  for (const id of requiredGuides) {
    const guide = answerGuides.find((candidate) => candidate.id === id);
    assert.ok(guide, `Missing ${id} answer guide`);
    assert.ok(guide.name.length >= 3);
    assert.ok(guide.description.length >= 30);
    assert.ok(Array.isArray(guide.steps) && guide.steps.length >= 3);
    assert.ok(guide.steps.every((step) => step.label && step.prompt.length >= 20));
    assert.ok(Array.isArray(guide.checklist) && guide.checklist.length >= 3);
  }
  assert.equal(new Set(answerGuides.map(({ id }) => id)).size, answerGuides.length);
});
