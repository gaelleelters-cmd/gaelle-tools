(function attachInterviewEngine(globalScope) {
  "use strict";

  const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "candidate", "for", "from", "has",
    "have", "in", "is", "it", "job", "looking", "of", "on", "or", "our", "role", "successful",
    "that", "the", "their", "this", "to", "we", "will", "with", "work", "you", "your",
  ]);

  const KNOWN_PHRASES = [
    "stakeholder engagement", "risk management", "project management", "programme management",
    "data analysis", "change management", "customer success", "business development",
    "quality assurance", "monitoring and evaluation", "supply chain", "incident response",
    "user research", "financial reporting", "strategic planning", "power bi", "machine learning",
    "public health", "case management", "capacity building", "resource mobilization",
  ];

  const GENERIC_ROLE_TOKENS = new Set([
    "administrator", "advisor", "analyst", "assistant", "associate", "chief", "consultant",
    "coordinator", "director", "executive", "head", "junior", "lead", "leader", "manager",
    "officer", "principal", "senior", "specialist", "supervisor",
  ]);

  function normalizeText(value) {
    return String(value == null ? "" : value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");
  }

  function matchRoleFamilies(role, rolePacks) {
    const normalizedRole = normalizeText(role);
    if (!normalizedRole) return [];
    const roleTokens = new Set(normalizedRole.split(" "));
    const packs = Array.isArray(rolePacks) ? rolePacks : [];
    const tokenFamilyCounts = new Map();

    for (const pack of packs) {
      const familyTokens = new Set(
        [pack.id, pack.name, ...(pack.aliases || [])]
          .flatMap((phrase) => normalizeText(phrase).split(" "))
          .filter((token) => token.length > 2 && !GENERIC_ROLE_TOKENS.has(token)),
      );
      for (const token of familyTokens) {
        tokenFamilyCounts.set(token, (tokenFamilyCounts.get(token) || 0) + 1);
      }
    }

    return packs
      .map((pack) => {
        const phrases = [...new Set(
          [pack.id, pack.name, ...(pack.aliases || [])].map(normalizeText).filter(Boolean),
        )];
        const distinctiveTokens = new Set(
          phrases
            .flatMap((phrase) => phrase.split(" "))
            .filter((token) => token.length > 2 && !GENERIC_ROLE_TOKENS.has(token)),
        );
        let score = 0;
        for (const phrase of phrases) {
          if (` ${normalizedRole} `.includes(` ${phrase} `)) {
            score += 80 + phrase.split(" ").length * 5;
          }
        }
        for (const token of distinctiveTokens) {
          if (!roleTokens.has(token)) continue;
          const familyCount = tokenFamilyCounts.get(token) || packs.length;
          score += familyCount === 1 ? 14 : familyCount === 2 ? 8 : 4;
        }
        for (const keyword of pack.keywords || []) {
          const normalizedKeyword = normalizeText(keyword);
          if (` ${normalizedRole} `.includes(` ${normalizedKeyword} `)) {
            score += normalizedKeyword.includes(" ") ? 18 : 10;
          }
        }
        return { ...pack, score };
      })
      .filter(({ score }) => score >= 8)
      .sort((left, right) => right.score - left.score || left.name.localeCompare(right.name));
  }

  function extractKeywords(jobDescription) {
    const normalized = normalizeText(jobDescription);
    if (!normalized) return [];

    const phrases = KNOWN_PHRASES.filter((phrase) => normalized.includes(normalizeText(phrase)));
    const counts = new Map();
    for (const token of normalized.split(" ")) {
      if (token.length < 3 || STOP_WORDS.has(token) || /^\d+$/.test(token)) continue;
      counts.set(token, (counts.get(token) || 0) + 1);
    }

    const words = [...counts]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([word]) => word)
      .filter((word) => !phrases.some((phrase) => phrase.split(" ").includes(word)));

    return [...new Set([...phrases, ...words])].slice(0, 24);
  }

  function asArray(value) {
    if (value == null || value === "") return [];
    return Array.isArray(value) ? value : [value];
  }

  function intersects(values, expected) {
    const normalizedValues = new Set((values || []).map(normalizeText));
    return asArray(expected).some((value) => normalizedValues.has(normalizeText(value)));
  }

  function filterQuestions(questions, filters = {}) {
    const categories = asArray(filters.categories || filters.category);
    const difficulties = asArray(filters.difficulties || filters.difficulty);
    const families = asArray(filters.families || filters.family);
    const search = normalizeText(filters.search);

    return (Array.isArray(questions) ? questions : []).filter((question) => {
      if (categories.length && !intersects([question.category], categories)) return false;
      if (difficulties.length && !intersects([question.difficulty], difficulties)) return false;
      if (filters.level && !intersects(question.levels, filters.level)) return false;
      if (
        families.length &&
        !intersects(question.families, families) &&
        !intersects(question.families, "universal")
      ) return false;
      if (search) {
        const haystack = normalizeText([
          question.question,
          question.whyAsked,
          ...(question.keywords || []),
        ].join(" "));
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  function hashSeed(seed) {
    const text = String(seed == null ? "interview-practice" : seed);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function seededRandom(seed) {
    let state = hashSeed(seed);
    return function random() {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
  }

  function uniqueQuestions(questions) {
    const ids = new Set();
    const prompts = new Set();
    return questions.filter((question) => {
      const prompt = normalizeText(question.question);
      if (!question.id || !prompt || ids.has(question.id) || prompts.has(prompt)) return false;
      ids.add(question.id);
      prompts.add(prompt);
      return true;
    });
  }

  function scoreQuestion(question, options, vacancyKeywords) {
    let score = 0;
    if (options.level && (question.levels || []).includes(options.level)) score += 4;
    if (intersects(question.families, options.roleFamilies || [])) score += 8;
    if ((question.families || []).includes("universal")) score += 2;
    const searchable = normalizeText([question.question, ...(question.keywords || [])].join(" "));
    for (const keyword of vacancyKeywords) {
      if (searchable.includes(normalizeText(keyword))) score += keyword.includes(" ") ? 5 : 2;
    }
    return score;
  }

  function generateSession(options = {}) {
    const length = Math.max(0, Number.parseInt(options.length, 10) || 10);
    const vacancyKeywords = extractKeywords(options.jobDescription);
    const random = seededRandom(options.seed);
    const filtered = filterQuestions(uniqueQuestions(options.questions || []), {
      level: options.level,
      categories: options.categories,
      difficulties: options.difficulties,
    });

    const ranked = filtered
      .map((question) => ({
        question,
        score: scoreQuestion(question, options, vacancyKeywords),
        tieBreaker: random(),
      }))
      .sort((left, right) => right.score - left.score || left.tieBreaker - right.tieBreaker);

    const buckets = new Map();
    for (const candidate of ranked) {
      const category = candidate.question.category || "other";
      if (!buckets.has(category)) buckets.set(category, []);
      buckets.get(category).push(candidate.question);
    }

    const categoryOrder = [...buckets.keys()]
      .map((category) => ({ category, order: random() }))
      .sort((left, right) => left.order - right.order)
      .map(({ category }) => category);
    const selected = [];
    while (selected.length < length && categoryOrder.some((category) => buckets.get(category).length)) {
      for (const category of categoryOrder) {
        const next = buckets.get(category).shift();
        if (next) selected.push(next);
        if (selected.length >= length) break;
      }
    }

    return selected.map((question) => {
      const searchable = normalizeText([question.question, ...(question.keywords || [])].join(" "));
      const matchedKeyword = vacancyKeywords.find((keyword) =>
        searchable.includes(normalizeText(keyword)),
      );
      if (!matchedKeyword) return { ...question };
      return {
        ...question,
        tailoredPrompt:
          `Connect your answer to the vacancy's emphasis on ${matchedKeyword}, using a truthful ` +
          "example and a measurable result.",
      };
    });
  }

  function round(value) {
    return Math.round(value * 100) / 100;
  }

  function summarizeProgress(history) {
    const sessions = (Array.isArray(history) ? history : []).filter((session) => (
      session &&
      session.status === "completed" &&
      typeof session.completedAt === "string" &&
      session.completedAt.trim() !== "" &&
      Number.isFinite(Date.parse(session.completedAt))
    ));
    const answers = sessions
      .flatMap((session) => (Array.isArray(session.answers) ? session.answers : []))
      .filter((answer) => {
        if (!answer || typeof answer !== "object") return false;
        return [answer.text, answer.response, answer.answer, answer.draft]
          .some((value) => typeof value === "string" && value.trim().length > 0);
      });
    const ratedAnswers = answers.filter(({ rating }) =>
      rating !== null &&
      String(rating).trim() !== "" &&
      Number.isInteger(Number(rating)) &&
      Number(rating) >= 1 &&
      Number(rating) <= 5,
    );
    const categoryRatings = new Map();

    for (const answer of ratedAnswers) {
      const category = answer.category || "uncategorized";
      if (!categoryRatings.has(category)) categoryRatings.set(category, []);
      categoryRatings.get(category).push(Number(answer.rating));
    }

    const categoryAverages = {};
    for (const [category, ratings] of categoryRatings) {
      categoryAverages[category] = round(
        ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length,
      );
    }

    const improvementAreas = Object.entries(categoryAverages)
      .map(([category, averageRating]) => ({ category, averageRating }))
      .sort((left, right) =>
        left.averageRating - right.averageRating || left.category.localeCompare(right.category),
      );

    return {
      sessionsCompleted: sessions.length,
      questionsAnswered: answers.length,
      questionsRated: ratedAnswers.length,
      averageRating: ratedAnswers.length
        ? round(ratedAnswers.reduce((sum, answer) => sum + Number(answer.rating), 0) / ratedAnswers.length)
        : 0,
      categoryAverages,
      improvementAreas,
    };
  }

  const InterviewEngine = {
    normalizeText,
    matchRoleFamilies,
    extractKeywords,
    filterQuestions,
    generateSession,
    summarizeProgress,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = InterviewEngine;
  } else {
    globalScope.InterviewEngine = InterviewEngine;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
