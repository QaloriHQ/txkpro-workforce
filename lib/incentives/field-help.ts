export const EDITOR_HELP: Record<string, string> = {
  "Program name":
    "Use a distinctive name employees will recognize in invitations and their reward bank.",
  Description:
    "Explain the behavior this program recognizes and how it benefits the team.",
  "Trade context (optional)":
    "Describe the trade or job setting. This helps people identify the program; it does not grant eligibility.",
  Starts:
    "The first program day in the employer timezone. Rewards require an active program and accepted terms.",
  Ends: "The last program day in the employer timezone. Ending a program preserves existing earned rights.",
  "Employer timezone":
    "Use an IANA timezone, such as America/Chicago. It controls local program dates, monthly allowances and retention checks.",
  "Crew name":
    "Name a real working team. Assign enrolled members before recording crew milestones.",
  "Crew membership":
    "Include only this program’s enrolled employees. A verified crew award snapshots its eligible roster and splits points into individual accounts.",
  "Milestone title":
    "Describe one verifiable achievement. Employees see this title when reviewing decisions and awards.",
  "Reward points":
    "Total points for this milestone. A crew award divides this total among its snapshotted members; it is not the amount per person.",
  Recipient:
    "Individual awards go to one employee. Crew awards create equal individual shares; there is no shared gift-card wallet.",
  "Condition grouping":
    "AND requires every condition. OR requires at least one; required safety checks still apply.",
  Metric:
    "Choose the verified numeric evidence to measure. Counts and cumulative totals require a defined, auditable source.",
  Comparison:
    "At least includes values equal to or above the target. At most includes values equal to or below it.",
  Target:
    "Use the same units as the metric: hours, counts, service days or budget percent. Service days use an actual verified employment start.",
  "Award frequency":
    "Once allows one award per participant or crew for this milestone. Per source allows another award only for a distinct verified source event.",
  "Safety checks":
    "Required safety and quality checks must be verified separately from performance. Reporting a hazard is never itself a safety failure.",
  "Approval sequence":
    "Manager review requires an independent reviewer. Two-stage review requires separate safety and manager approvers; a recipient cannot approve their own award.",
  "Program budget (USD cents)":
    "The total program ceiling in cents: 150000 = $1,500. Confirmed funding must also be available; this field does not fund rewards.",
  "Points per conversion block":
    "The point units exchanged for one block of reward value. Example: 100 points per 100-cent block means 100 points = $1.",
  "USD cents per block":
    "The USD value of a conversion block. 100 cents = $1. Supported redemptions must convert to whole cents.",
  "Normal redemption minimum (points)":
    "Minimum banked points for an ordinary redemption. Compatible immediate safety rewards may use their published minimum override.",
  "Verified safety report points":
    "Individual points for one verified distinct hazard. Duplicate reports do not create unlimited awards; confirmed funding and eligibility still apply.",
  "Monthly points to give":
    "Each employee’s monthly giving allowance. They may give it to coworkers, not themselves. Unused giving points expire monthly; received points follow earned-point terms.",
  "Monthly peer recipient cap":
    "Maximum peer points one employee may receive during an employer-local month. Independent validation and collusion checks still apply.",
  "Earned-point expiration":
    "Choose indefinite availability or a published award-age limit. Existing lots keep the terms accepted when earned.",
  "Months after award":
    "How many months each new award remains available, from 1 to 120. This does not change previously earned lots.",
  "After employment ends":
    "Retain follows the original expiry. A departure window limits how long earned points remain redeemable after a verified end date.",
  "Departure redemption days":
    "Redemption days after employment ends, subject to any earlier original expiry. Use 1–3650 days and disclose the policy before acceptance.",
  "Verified safety report reward":
    "Immediate queues an eligible reward request. Bank keeps points available. Bank with immediate redemption lets the reporter choose when to redeem the qualifying safety lot.",
  "Employee-facing program terms":
    "Review the complete eligibility, evidence, rewards, budget and dispute rules before publication. Accepted financial terms cannot be silently overwritten.",
  "Public recognition":
    "Offer a company recognition board. Employees must separately opt in; monetary amounts and confidential safety evidence stay private.",
  "In-app notification preference":
    "Save the program’s notification preference. Operational in-app award, decision and safety notices remain available in the program.",
  "Email notification preference":
    "Save an email preference only. Email delivery requires a verified integration; selecting this does not connect a provider.",
  "budget percent":
    "Scenario budget used as a percentage of the approved budget; 100 means exactly on budget. This creates no verified evidence.",
  "delay hours":
    "Scenario delay in hours; 0 means on time. Real exceptions such as supplier delays require recorded evidence and review.",
  reviews:
    "Scenario count of attributable qualifying customer reviews. Real rewards require separately verified source events.",
  "training count":
    "Scenario count of verified qualifying training completions. It is not a licensing or skill-verification claim.",
  "service days":
    "Scenario elapsed calendar days since actual verified employment started. 365 service days is not a leap-year anniversary rule.",
  "qualifying projects":
    "Scenario count of projects meeting defined quality and safety criteria. Absence of reports does not establish qualification.",
  "Simulation safety":
    "Turn on only to model verified completion of required safety and quality checks. Simulations never create awards or approve real evidence.",
};
export function editorHelp(label: string) {
  return (
    EDITOR_HELP[label] ??
    "Review this program setting before saving or publishing."
  );
}
