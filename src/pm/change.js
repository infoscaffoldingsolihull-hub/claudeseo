/**
 * Integrated change control helpers — pure JS. Change control board (CCB)
 * membership, vote rules and tally.
 */

export const CHANGE_STATUSES = ['Raised', 'Analysed', 'Approved', 'Rejected', 'Implemented'];

/** CCB members by role, with the lens each one votes through. */
export const CCB_MEMBERS = [
  { role: 'Sponsor (PAA programme board)', lens: 'value', chair: true },
  { role: 'Project Director', lens: 'schedule' },
  { role: 'Finance Controller', lens: 'cost' },
  { role: 'Design Consultant (Engineer)', lens: 'technical' },
  { role: 'Operations & Airline Liaison', lens: 'benefits' },
];

/**
 * A member's vote from the analysed impact.
 * merit 0..1 = business value of the change; costRatio = cost / BAC;
 * scheduleDays = days the change adds to the forecast finish.
 */
export function ruleVote(member, { merit = 0.5, costRatio = 0, scheduleDays = 0, quality = 0, risk = 0 }) {
  let score = merit;
  if (member.lens === 'cost') score -= costRatio * 18;
  if (member.lens === 'schedule') score -= scheduleDays / 60;
  if (member.lens === 'technical') score += quality * 0.3 - risk * 0.2;
  if (member.lens === 'benefits') score += 0.12;
  if (member.lens === 'value') score -= costRatio * 6 + scheduleDays / 200;
  return score >= 0.5 ? 'approve' : 'reject';
}

/** Tally votes; the chair's vote breaks a tie. Quorum = a majority of members voting. */
export function tallyVotes(votes, members = CCB_MEMBERS) {
  let approve = 0;
  let reject = 0;
  for (const m of members) {
    if (votes[m.role] === 'approve') approve++;
    else if (votes[m.role] === 'reject') reject++;
  }
  const quorum = approve + reject > members.length / 2;
  let decision = null;
  if (quorum) {
    if (approve > reject) decision = 'Approved';
    else if (reject > approve) decision = 'Rejected';
    else {
      const chair = members.find((m) => m.chair);
      decision = chair && votes[chair.role] === 'approve' ? 'Approved' : 'Rejected';
    }
  }
  return { approve, reject, abstain: members.length - approve - reject, quorum, decision };
}
