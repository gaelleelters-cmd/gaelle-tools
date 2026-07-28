(function attachCoreQuestions(globalScope) {
  "use strict";

  const ALL_LEVELS = ["entry", "mid", "senior", "manager"];
  const SENIOR_LEVELS = ["mid", "senior", "manager"];

  const definitions = [
    ["career-story", "Walk me through the experiences that prepared you for this role.", "motivation", "entry", ["career path", "relevance"], "Tests whether your career story is focused, credible, and connected to the opportunity."],
    ["why-role", "Why are you interested in this role at this point in your career?", "motivation", "entry", ["motivation", "career goals"], "Checks that your motivation is specific to the work rather than a generic desire to change jobs."],
    ["why-organization", "What attracted you to our organization, mission, or customers?", "motivation", "entry", ["organization research", "mission"], "Reveals how carefully you researched the organization and whether your values align with its work."],
    ["greatest-strength", "Which professional strength would help you contribute most in this role?", "competency", "entry", ["strengths", "evidence"], "Looks for self-awareness supported by evidence, not an unsupported list of positive qualities."],
    ["development-area", "What professional skill are you actively developing, and how are you improving it?", "behavioral", "mid", ["self-awareness", "learning"], "Assesses honest self-reflection and whether you take practical ownership of professional growth."],
    ["proud-achievement", "Tell me about a professional achievement that you are especially proud of.", "behavioral", "entry", ["achievement", "impact"], "Evaluates what you value and whether you can explain your contribution and its measurable impact."],
    ["difficult-priority", "Describe a time you had to choose between two important competing priorities.", "behavioral", "mid", ["prioritization", "judgment"], "Tests how you weigh urgency, impact, dependencies, and stakeholder expectations under constraint."],
    ["tight-deadline", "Tell me about a time you delivered quality work under a very tight deadline.", "behavioral", "mid", ["deadlines", "quality"], "Explores planning, composure, and the safeguards you use to maintain quality when time is limited."],
    ["ambiguous-request", "Describe how you handled an important request when the requirements were unclear.", "behavioral", "mid", ["ambiguity", "requirements"], "Assesses whether you clarify outcomes and assumptions before investing effort in an uncertain task."],
    ["mistake-recovery", "Tell me about a mistake you made at work and how you addressed its consequences.", "behavioral", "mid", ["accountability", "recovery"], "Looks for accountability, timely communication, corrective action, and learning without blame shifting."],
    ["failed-approach", "Describe an approach that did not work and what you changed as a result.", "behavioral", "mid", ["failure", "adaptability"], "Tests resilience and whether evidence causes you to adjust your methods rather than defend a weak approach."],
    ["conflict-peer", "Tell me about a disagreement with a colleague and how you reached a workable outcome.", "behavioral", "mid", ["conflict resolution", "teamwork"], "Evaluates listening, respectful challenge, and the ability to preserve a productive working relationship."],
    ["difficult-feedback", "Describe a time you received difficult feedback and what you did with it.", "behavioral", "entry", ["feedback", "growth"], "Assesses openness to feedback and whether you translate it into an observable change in behavior."],
    ["give-feedback", "Tell me about a time you gave constructive feedback that improved an outcome.", "communication", "mid", ["feedback", "coaching"], "Checks whether you can make feedback specific, respectful, timely, and useful to another person."],
    ["influence-no-authority", "Describe a time you influenced a decision without having formal authority.", "behavioral", "senior", ["influence", "stakeholders"], "Tests stakeholder awareness, evidence-based persuasion, and your ability to build support across boundaries."],
    ["complex-communication", "How have you explained a complex issue to an audience unfamiliar with the subject?", "communication", "mid", ["communication", "clarity"], "Assesses audience awareness and whether you can simplify complexity without losing important accuracy."],
    ["active-listening", "Tell me about a time careful listening changed your understanding of a problem.", "communication", "entry", ["listening", "empathy"], "Reveals whether you seek to understand people and context before deciding on a response."],
    ["team-contribution", "Describe your most effective contribution to a team result.", "behavioral", "entry", ["teamwork", "collaboration"], "Looks for a clear personal contribution while recognizing the work and expertise of others."],
    ["cross-functional", "Tell me about a successful collaboration across teams with different priorities.", "behavioral", "senior", ["cross-functional", "alignment"], "Tests how you align incentives, clarify ownership, and manage dependencies between groups."],
    ["adapt-change", "Describe a significant workplace change and how you adapted to it.", "behavioral", "mid", ["adaptability", "change"], "Assesses emotional steadiness, learning speed, and constructive action during uncertain change."],
    ["learn-quickly", "Tell me about a time you had to learn a new subject or tool quickly.", "competency", "entry", ["learning agility", "new skills"], "Explores how you identify learning needs, find reliable resources, practice, and apply knowledge."],
    ["improve-process", "Describe a process you improved and how you knew the change worked.", "competency", "mid", ["process improvement", "measurement"], "Looks for diagnosis, practical improvement, adoption by others, and evidence of a better result."],
    ["data-decision", "Tell me about a decision you improved by using data or other evidence.", "competency", "mid", ["data informed", "decision making"], "Tests whether you select relevant evidence, recognize limitations, and connect analysis to action."],
    ["ethical-concern", "Describe a time you raised or resolved an ethical concern at work.", "ethics", "senior", ["ethics", "integrity"], "Evaluates courage, judgment, confidentiality, and appropriate use of policies or escalation channels."],
    ["confidential-information", "How have you protected confidential or sensitive information in your work?", "ethics", "mid", ["confidentiality", "data protection"], "Checks practical understanding of need-to-know access, secure handling, and responsible communication."],
    ["excluded-colleague", "What would you do if you noticed a colleague being excluded from key discussions?", "situational", "mid", ["inclusion", "team culture"], "Assesses inclusive judgment and whether you can intervene constructively without making assumptions."],
    ["unrealistic-deadline", "What would you do if a manager assigned an important but unrealistic deadline?", "situational", "mid", ["expectation management", "prioritization"], "Tests whether you surface constraints early, propose options, and remain accountable for delivery."],
    ["stakeholder-rejects", "How would you respond if a key stakeholder rejected your recommendation?", "situational", "senior", ["stakeholder management", "influence"], "Explores curiosity, resilience, and your ability to distinguish valid objections from misalignment."],
    ["first-ninety-days", "What would you aim to learn and accomplish during your first ninety days?", "situational", "senior", ["onboarding", "priorities"], "Checks whether you balance listening and relationship building with realistic early contribution."],
    ["lead-uncertainty", "Tell me about a time you helped others move forward during uncertainty.", "leadership", "senior", ["leadership", "uncertainty"], "Assesses whether you create clarity, invite expertise, communicate honestly, and maintain momentum."],
    ["delegate-outcome", "Describe a time you delegated important work while remaining accountable for the outcome.", "leadership", "senior", ["delegation", "accountability"], "Tests how you match ownership to capability, set guardrails, and support without micromanaging."],
    ["underperformance", "How have you addressed a pattern of underperformance fairly and constructively?", "leadership", "senior", ["performance management", "coaching"], "Evaluates clarity, evidence, empathy, follow-through, and fairness in a difficult management situation."],
  ];

  const adaptableExamples = {
    "career-story": "I moved from coordinating frontline requests to improving the process behind them, then led a cross-team rollout that cut response time by 18 percent.",
    "why-role": "The role combines stakeholder work I already do well with programme design I have deliberately developed through two recent assignments.",
    "why-organization": "Your published commitment to accessible services connects with my work simplifying an intake process for people using assistive technology.",
    "greatest-strength": "My strongest contribution is structured follow-through; on a delayed launch I clarified owners and checkpoints, helping the team recover two weeks.",
    "development-area": "I noticed my large-group facilitation was less confident, so I sought feedback, co-facilitated four sessions, and tracked stronger participation.",
    "proud-achievement": "I redesigned a handover with the affected team, reduced avoidable rework by 22 percent, and left them able to maintain it independently.",
    "difficult-priority": "When a client deadline conflicted with a control review, I compared impact and dependencies, protected the control, and renegotiated one deliverable.",
    "tight-deadline": "For a report due in forty-eight hours, I agreed the critical questions, divided review ownership, and delivered on time with no corrections requested.",
    "ambiguous-request": "I converted a vague request for a dashboard into three decisions it needed to support, validated mock-ups, and avoided building unused features.",
    "mistake-recovery": "After sending an outdated figure, I alerted recipients immediately, issued a corrected source-linked version, and added a two-person release check.",
    "failed-approach": "A weekly meeting was not resolving blockers, so I replaced status updates with an owner-and-decision log and cut unresolved items by half.",
    "conflict-peer": "A colleague and I disagreed on launch readiness; we listed shared criteria, reviewed the evidence together, and agreed a limited pilot.",
    "difficult-feedback": "I learned that my detailed updates obscured decisions, so I adopted one-page summaries and confirmed that leaders acted faster on them.",
    "give-feedback": "I privately showed a colleague where an unclear handover caused rework, agreed a template with them, and recognized the subsequent improvement.",
    "influence-no-authority": "I mapped concerns across three teams, used a small pilot to answer the strongest objection, and gained voluntary adoption without escalation.",
    "complex-communication": "I explained a data-retention change through a simple customer journey, defined the two required actions, and checked understanding with scenarios.",
    "active-listening": "A user interview revealed that the apparent training problem was actually a permissions delay, changing both our diagnosis and investment.",
    "team-contribution": "I owned dependency tracking for a multidisciplinary launch, surfaced two conflicts early, and helped the team deliver without weekend work.",
    "cross-functional": "I aligned operations and product around a shared outcome, documented decision rights, and reduced approval time from nine days to five.",
    "adapt-change": "When priorities shifted mid-quarter, I revalidated outcomes, paused low-value work, and helped colleagues translate uncertainty into a two-week plan.",
    "learn-quickly": "I learned a new reporting tool through a focused course and sandbox project, then produced a validated dashboard within three weeks.",
    "improve-process": "I measured where requests stalled, removed one duplicate approval, and monitored cycle time fall from six days to four.",
    "data-decision": "I combined usage data with interviews, found that the largest segment had the lowest completion rate, and redirected effort to its main barrier.",
    "ethical-concern": "When consent language did not match planned data use, I paused collection, consulted the responsible specialist, and corrected the process.",
    "confidential-information": "I limited a sensitive file to named reviewers, removed identifiers from working extracts, and documented secure deletion after the review.",
    "excluded-colleague": "I would first check the pattern privately, invite the colleague's perspective, and then reset meeting practices so access does not depend on confidence.",
    "unrealistic-deadline": "I would show the critical path, offer a smaller safe deliverable by the date, and make the cost and risk of each option explicit.",
    "stakeholder-rejects": "I would ask which assumption they reject, separate evidence gaps from competing priorities, and test a reversible option before seeking escalation.",
    "first-ninety-days": "In month one I would map people and outcomes, in month two validate priorities, and by month three deliver one useful, measurable improvement.",
    "lead-uncertainty": "I established what was known, invited concerns twice weekly, assigned near-term decisions, and kept a team moving during a funding delay.",
    "delegate-outcome": "I gave a colleague ownership of a partner review with clear decision limits, scheduled two checkpoints, and supported a strong on-time recommendation.",
    "underperformance": "I used documented examples to clarify the gap, listened for barriers, agreed a thirty-day support plan, and reviewed progress consistently.",
  };

  function makeQuestion(definition) {
    const [id, question, category, difficulty, keywords, whyAsked] = definition;
    const levels = difficulty === "senior" ? SENIOR_LEVELS : ALL_LEVELS;
    return {
      id: `core-${id}`,
      question,
      category,
      difficulty,
      levels: [...levels],
      families: ["universal"],
      whyAsked,
      answerPlan: [
        "Choose one specific and truthful example with enough context to understand the stakes.",
        "Separate your own decisions and actions from the broader work completed by the team.",
        "Close with a concrete result, what you learned, and how it applies to this opportunity.",
      ],
      modelAnswer:
        `Adapt this ${category} example using only truthful details from your experience: ` +
        `${adaptableExamples[id]} For “${question}”, keep the context brief, make your own decisions visible, ` +
        `and support the result with evidence relevant to ${keywords.join(" and ")}. Replace the figures, ` +
        "setting, and actions with your own; the sample demonstrates structure, not a universally correct answer.",
      followUps: [
        "What was your personal contribution, and how did you measure the result?",
        "What would you do differently if you faced the same situation again?",
      ],
      keywords,
    };
  }

  const INTERVIEW_CORE_QUESTIONS = definitions.map(makeQuestion);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = INTERVIEW_CORE_QUESTIONS;
  } else {
    globalScope.INTERVIEW_CORE_QUESTIONS = INTERVIEW_CORE_QUESTIONS;
  }
})(typeof globalThis !== "undefined" ? globalThis : this);
