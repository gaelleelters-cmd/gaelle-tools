(function attachAnswerGuides(globalScope) {
  "use strict";

  const INTERVIEW_ANSWER_GUIDES = [
    {
      id: "star",
      name: "STAR behavioral answer",
      description: "A concise evidence structure for showing how your past behavior produced a relevant result.",
      bestFor: ["behavioral", "competency", "communication", "ethics"],
      steps: [
        { label: "Situation", prompt: "Set the specific context, timing, and stakes in one or two sentences." },
        { label: "Task", prompt: "State the outcome you personally owned and the constraints you had to manage." },
        { label: "Action", prompt: "Explain your decisions and actions in enough detail to reveal your skills." },
        { label: "Result", prompt: "Share measurable impact, stakeholder response, and one honest lesson learned." },
      ],
      checklist: [
        "Use one truthful example rather than combining several unrelated stories.",
        "Spend most of the answer on your reasoning and actions.",
        "Quantify the outcome where the evidence genuinely supports it.",
      ],
    },
    {
      id: "prep",
      name: "PREP concise response",
      description: "A direct structure for opinion, judgment, and communication questions that need a clear answer.",
      bestFor: ["communication", "motivation", "situational"],
      steps: [
        { label: "Point", prompt: "Lead with your answer or recommendation instead of delaying your main message." },
        { label: "Reason", prompt: "Give the most important reason, principle, or evidence supporting your position." },
        { label: "Example", prompt: "Add one concrete example that demonstrates the claim in real practice." },
        { label: "Point", prompt: "Restate the conclusion and connect it explicitly to the target role." },
      ],
      checklist: [
        "Make the opening point specific enough to be useful.",
        "Use evidence rather than relying only on personal preference.",
        "Keep supporting detail proportionate to the interviewer's question.",
      ],
    },
    {
      id: "technical",
      name: "Technical explanation",
      description: "A transparent method for explaining technical choices, safeguards, and trade-offs to any audience.",
      bestFor: ["technical", "competency"],
      steps: [
        { label: "Clarify", prompt: "Confirm the goal, users, constraints, assumptions, and definition of success." },
        { label: "Approach", prompt: "Describe a logical method and explain why it fits the stated constraints." },
        { label: "Trade-offs", prompt: "Compare credible alternatives and identify costs, risks, and limitations." },
        { label: "Verify", prompt: "Explain testing, monitoring, review, or other evidence used to validate the result." },
      ],
      checklist: [
        "State assumptions openly and ask clarifying questions when appropriate.",
        "Translate specialist language when speaking to a mixed audience.",
        "Include security, quality, ethics, or failure handling where relevant.",
      ],
    },
    {
      id: "case-response",
      name: "Case response",
      description: "A hypothesis-led structure for unfamiliar scenarios where the process matters as much as the answer.",
      bestFor: ["situational", "technical", "competency"],
      steps: [
        { label: "Frame", prompt: "Define the decision, desired outcome, scope, stakeholders, and key constraints." },
        { label: "Diagnose", prompt: "Break the problem into drivers and request the evidence needed to test them." },
        { label: "Options", prompt: "Develop viable options and compare impact, feasibility, risk, and reversibility." },
        { label: "Recommend", prompt: "Choose a path, state assumptions, and define implementation and measurement." },
      ],
      checklist: [
        "Do not invent missing facts; identify what you would need to learn.",
        "Prioritize the few drivers most likely to change the decision.",
        "Name an early checkpoint that could trigger a course correction.",
      ],
    },
    {
      id: "leadership",
      name: "Leadership impact",
      description: "A people-centered structure linking direction, inclusion, execution, and sustainable team capability.",
      bestFor: ["leadership", "behavioral", "situational"],
      steps: [
        { label: "Direction", prompt: "Explain the outcome, why it mattered, and how you made priorities clear." },
        { label: "People", prompt: "Show how you listened, included expertise, assigned ownership, and built trust." },
        { label: "Execution", prompt: "Describe decisions, resources, governance, and adjustments made during delivery." },
        { label: "Legacy", prompt: "Share results for both the organization and the capability of the people involved." },
      ],
      checklist: [
        "Credit the team while remaining clear about your own accountability.",
        "Explain how dissent, risk, and difficult information reached you.",
        "Include what became stronger or more sustainable after the result.",
      ],
    },
    {
      id: "motivation",
      name: "Motivation bridge",
      description: "A grounded framework connecting the organization, the role's real work, and your credible contribution.",
      bestFor: ["motivation"],
      steps: [
        { label: "Organization", prompt: "Name a specific mission, product, challenge, or way of working that matters to you." },
        { label: "Role", prompt: "Identify responsibilities that fit the work you genuinely want to do next." },
        { label: "Evidence", prompt: "Connect two relevant strengths to brief examples from your actual experience." },
        { label: "Contribution", prompt: "Describe realistic early value and the capability you hope to deepen." },
      ],
      checklist: [
        "Reference current, verifiable information rather than empty praise.",
        "Avoid making compensation, status, or escape from a current job the main reason.",
        "Keep the claims consistent with the experience shown elsewhere in your application.",
      ],
    },
  ];

  if (typeof module !== "undefined" && module.exports) {
    module.exports = INTERVIEW_ANSWER_GUIDES;
  } else {
    globalScope.INTERVIEW_ANSWER_GUIDES = INTERVIEW_ANSWER_GUIDES;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
