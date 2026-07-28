const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const InterviewEngine = require("../js/engine.js");

const rolePacks = [
  {
    id: "software-it",
    name: "Software & IT",
    aliases: ["software engineer", "developer", "information technology", "systems administrator"],
    keywords: ["javascript", "cloud", "security"],
  },
  {
    id: "ngo-un",
    name: "NGO & UN",
    aliases: ["programme officer", "humanitarian", "united nations", "protection officer"],
    keywords: ["beneficiaries", "refugees", "humanitarian"],
  },
  {
    id: "project-programme",
    name: "Project & Programme",
    aliases: ["project manager", "programme manager", "project coordinator"],
    keywords: ["milestones", "stakeholders", "delivery"],
  },
  {
    id: "finance",
    name: "Finance & Accounting",
    aliases: ["finance officer", "accountant", "financial analyst", "budget manager"],
    keywords: ["budgeting", "forecasting", "reconciliation"],
  },
  {
    id: "sales-customer-success",
    name: "Sales & Customer Success",
    aliases: ["sales manager", "account executive", "account manager", "customer success manager"],
    keywords: ["pipeline", "retention", "revenue"],
  },
];

function question(overrides) {
  return {
    id: "q-default",
    question: "Tell me about a relevant example.",
    category: "behavioral",
    difficulty: "mid",
    levels: ["entry", "mid", "senior", "manager"],
    families: ["universal"],
    whyAsked: "Assesses evidence from past behavior.",
    answerPlan: ["Set the context", "Explain your action", "Share the result"],
    modelAnswer: "I clarified the goal, took focused action, and measured the result.",
    followUps: ["What did you learn?"],
    keywords: ["teamwork"],
    ...overrides,
  };
}

test("normalizeText removes accents, punctuation, and repeated whitespace", () => {
  assert.equal(
    InterviewEngine.normalizeText("  Développeur—Cloud / SÉNIOR!  "),
    "developpeur cloud senior",
  );
});

test("matchRoleFamilies ranks direct role matches and related families", () => {
  const matches = InterviewEngine.matchRoleFamilies(
    "Senior software engineer and project lead",
    rolePacks,
  );

  assert.equal(matches[0].id, "software-it");
  assert.ok(matches.some((match) => match.id === "project-programme"));
  assert.ok(matches.every((match) => match.score > 0));
});

test("matchRoleFamilies accepts an unmatched custom title", () => {
  assert.deepEqual(
    InterviewEngine.matchRoleFamilies("Chief telescope alignment specialist", rolePacks),
    [],
  );
});

test("matchRoleFamilies ignores generic title words shared by unrelated families", () => {
  assert.deepEqual(
    InterviewEngine.matchRoleFamilies("Finance Officer", rolePacks).map(({ id }) => id),
    ["finance"],
  );
  assert.deepEqual(
    InterviewEngine.matchRoleFamilies("Project Manager", rolePacks).map(({ id }) => id),
    ["project-programme"],
  );
  assert.deepEqual(
    InterviewEngine.matchRoleFamilies("Senior Programme Officer", rolePacks).map(({ id }) => id),
    ["ngo-un", "project-programme"],
  );
});

test("engine exports to browsers without leaking a Node global", () => {
  assert.equal(globalThis.InterviewEngine, undefined);

  const source = fs.readFileSync(path.join(__dirname, "../js/engine.js"), "utf8");
  const browserContext = {};
  vm.runInNewContext(source, browserContext);

  assert.equal(typeof browserContext.InterviewEngine.normalizeText, "function");
  assert.equal(browserContext.module, undefined);
});

test("extractKeywords keeps useful phrases and removes vacancy boilerplate", () => {
  const keywords = InterviewEngine.extractKeywords(
    "We are looking for a Project Manager. The role leads data analysis, stakeholder engagement, " +
      "risk management, and Power BI reporting. The successful candidate will work with the team.",
  );

  assert.ok(keywords.includes("stakeholder engagement"));
  assert.ok(keywords.includes("risk management"));
  assert.ok(keywords.includes("power bi"));
  assert.ok(!keywords.includes("successful candidate"));
  assert.ok(!keywords.includes("the"));
});

test("filterQuestions combines category, difficulty, level, family, and search filters", () => {
  const questions = [
    question({
      id: "tech-1",
      question: "How do you diagnose a production incident?",
      category: "technical",
      difficulty: "senior",
      levels: ["senior", "manager"],
      families: ["software-it"],
      keywords: ["incident response"],
    }),
    question({ id: "general-1", question: "Why this role?", category: "motivation" }),
  ];

  const result = InterviewEngine.filterQuestions(questions, {
    categories: ["technical"],
    difficulties: ["senior"],
    level: "senior",
    families: ["software-it"],
    search: "production incident",
  });

  assert.deepEqual(result.map(({ id }) => id), ["tech-1"]);
});

test("generateSession deduplicates IDs and normalized question text", () => {
  const duplicateText = "How do you resolve conflict within a team?";
  const questions = [
    question({ id: "a", question: duplicateText, category: "behavioral" }),
    question({ id: "a", question: "A duplicate ID", category: "situational" }),
    question({ id: "b", question: `  ${duplicateText.toUpperCase()}  `, category: "leadership" }),
    question({ id: "c", question: "How do you prioritize urgent work?", category: "situational" }),
  ];

  const result = InterviewEngine.generateSession({ questions, length: 10, seed: "dedupe" });

  assert.deepEqual(
    new Set(result.map(({ id }) => id)).size,
    result.length,
  );
  assert.equal(result.length, 2);
});

test("generateSession is seeded, balanced, and tailored to vacancy keywords", () => {
  const categories = ["behavioral", "situational", "technical", "motivation"];
  const questions = Array.from({ length: 20 }, (_, index) =>
    question({
      id: `q-${index}`,
      question: `Question ${index} about ${index % 2 ? "stakeholders" : "delivery"}`,
      category: categories[index % categories.length],
      families: index < 12 ? ["project-programme"] : ["universal"],
      keywords: index % 2 ? ["stakeholder engagement"] : ["delivery"],
    }),
  );
  const options = {
    questions,
    length: 8,
    seed: "same-seed",
    roleFamilies: ["project-programme"],
    level: "mid",
    jobDescription: "Lead stakeholder engagement and programme delivery.",
  };

  const first = InterviewEngine.generateSession(options);
  const second = InterviewEngine.generateSession(options);
  const different = InterviewEngine.generateSession({ ...options, seed: "different-seed" });

  assert.deepEqual(first.map(({ id }) => id), second.map(({ id }) => id));
  assert.notDeepEqual(first.map(({ id }) => id), different.map(({ id }) => id));
  assert.equal(new Set(first.map(({ category }) => category)).size, 4);
  assert.ok(first.some(({ tailoredPrompt }) => /stakeholder|delivery/i.test(tailoredPrompt)));
});

test("summarizeProgress calculates totals, averages, and improvement areas", () => {
  const summary = InterviewEngine.summarizeProgress([
    {
      status: "completed",
      completedAt: "2026-07-20T10:00:00Z",
      answers: [
        { category: "behavioral", text: "A specific conflict example", rating: 2 },
        { category: "technical", text: "A production diagnosis example", rating: 4 },
      ],
    },
    {
      status: "completed",
      completedAt: "2026-07-21T10:00:00Z",
      answers: [
        { category: "behavioral", text: "An adaptability example", rating: 3 },
        { category: "technical", text: "A system design example", rating: 5 },
        { category: "leadership", text: "A delegation example", rating: null },
      ],
    },
  ]);

  assert.equal(summary.sessionsCompleted, 2);
  assert.equal(summary.questionsAnswered, 5);
  assert.equal(summary.questionsRated, 4);
  assert.equal(summary.averageRating, 3.5);
  assert.equal(summary.categoryAverages.behavioral, 2.5);
  assert.equal(summary.categoryAverages.technical, 4.5);
  assert.equal(summary.improvementAreas[0].category, "behavioral");
});

test("summarizeProgress rejects incomplete sessions, blank answers, and invalid ratings", () => {
  const summary = InterviewEngine.summarizeProgress([
    {
      answers: [{ category: "behavioral", text: "Not from a completed session", rating: 5 }],
    },
    {
      status: "in-progress",
      completedAt: "2026-07-22T10:00:00Z",
      answers: [{ category: "technical", text: "Still in progress", rating: 5 }],
    },
    {
      completedAt: "not-a-date",
      answers: [{ category: "technical", text: "Invalid completion marker", rating: 5 }],
    },
    {
      status: "completed",
      completedAt: "2026-07-23T10:00:00Z",
      answers: [
        { category: "behavioral", text: "   \n\t", rating: 4 },
        { category: "behavioral", text: "Valid answer one", rating: 0 },
        { category: "technical", response: "Valid answer two", rating: 6 },
        { category: "technical", draft: "Valid answer three", rating: 3.5 },
        { category: "leadership", answer: "Valid answer four", rating: " 4 " },
        { category: "ethics", text: "Valid answer five", rating: 2 },
      ],
    },
  ]);

  assert.equal(summary.sessionsCompleted, 1);
  assert.equal(summary.questionsAnswered, 5);
  assert.equal(summary.questionsRated, 2);
  assert.equal(summary.averageRating, 3);
  assert.deepEqual(summary.categoryAverages, { leadership: 4, ethics: 2 });
});

test("summarizeProgress requires the exact completed status and a valid completion date", () => {
  const statuses = [undefined, null, "", "complete", "Completed", "in-progress", "cancelled"];
  const history = statuses.map((status, index) => ({
    status,
    completedAt: "2026-07-24T10:00:00Z",
    answers: [{ category: "behavioral", text: `Rejected answer ${index}`, rating: 5 }],
  }));
  history.push(
    {
      status: "completed",
      completedAt: "invalid",
      answers: [{ category: "technical", text: "Invalid date answer", rating: 5 }],
    },
    {
      status: "completed",
      completedAt: "2026-07-25T10:00:00Z",
      answers: [{ category: "leadership", text: "Only accepted answer", rating: 4 }],
    },
  );

  const summary = InterviewEngine.summarizeProgress(history);

  assert.equal(summary.sessionsCompleted, 1);
  assert.equal(summary.questionsAnswered, 1);
  assert.equal(summary.questionsRated, 1);
  assert.deepEqual(summary.categoryAverages, { leadership: 4 });
});

test("summarizeProgress accepts any nonblank supported answer field", () => {
  const summary = InterviewEngine.summarizeProgress([
    {
      status: "completed",
      completedAt: "2026-07-26T10:00:00Z",
      answers: [
        {
          category: "technical",
          text: "   ",
          response: "A valid response that follows the blank text field",
          rating: 5,
        },
        {
          category: "behavioral",
          text: "\n",
          response: "\t",
          answer: "A valid answer in the third supported field",
          rating: 3,
        },
        {
          category: "ethics",
          text: "",
          response: " ",
          answer: "\n",
          draft: "A valid draft in the fourth supported field",
          rating: 4,
        },
      ],
    },
  ]);

  assert.equal(summary.questionsAnswered, 3);
  assert.equal(summary.questionsRated, 3);
  assert.equal(summary.averageRating, 4);
});
