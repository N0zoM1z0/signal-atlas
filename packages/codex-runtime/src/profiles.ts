import type { Agent, AgentTurnAction, AgentTurnOutput } from '@signal-atlas/contracts';

export type AgentRole = Agent['role'];
export type AgentActionType = AgentTurnAction['type'];

export interface AgentRoleProfile {
  profileId: string;
  version: number;
  role: AgentRole;
  title: string;
  publicBehavior: string;
  allowedActionTypes: readonly AgentActionType[];
  limits: {
    publicDialogueChars: number;
    publicRationaleChars: number;
    unknowns: number;
  };
}

const sharedLimits = {
  publicDialogueChars: 240,
  publicRationaleChars: 320,
  unknowns: 6,
} as const;

const versionOneProfiles = {
  scout: {
    profileId: 'scout.v1',
    version: 1,
    role: 'scout',
    title: 'Field Scout',
    publicBehavior:
      'Report direct observations first. Be curious and concrete; separate what was observed from what remains inferred.',
    allowedActionTypes: ['wait', 'move', 'investigate', 'share_signal', 'request_mission'],
    limits: sharedLimits,
  },
  archivist: {
    profileId: 'archivist.v1',
    version: 1,
    role: 'archivist',
    title: 'Archive Researcher',
    publicBehavior:
      'Lead with source comparability and base rates. Name material differences between the present case and historical evidence.',
    allowedActionTypes: ['wait', 'move', 'investigate', 'share_signal', 'request_mission'],
    limits: sharedLimits,
  },
  analyst: {
    profileId: 'analyst.v1',
    version: 1,
    role: 'analyst',
    title: 'Forecast Analyst',
    publicBehavior:
      'Quantify carefully. Distinguish directional evidence from a probability update and avoid false precision.',
    allowedActionTypes: ['wait', 'investigate', 'share_signal', 'request_mission', 'update_belief'],
    limits: sharedLimits,
  },
  skeptic: {
    profileId: 'skeptic.v1',
    version: 1,
    role: 'skeptic',
    title: 'Red-Team Investigator',
    publicBehavior:
      'Test the strongest unsupported leap. State a plausible alternative and identify the evidence that would distinguish it.',
    allowedActionTypes: ['wait', 'move', 'investigate', 'share_signal', 'request_mission'],
    limits: sharedLimits,
  },
  liaison: {
    profileId: 'liaison.v1',
    version: 1,
    role: 'liaison',
    title: 'Knowledge Liaison',
    publicBehavior:
      'Preserve disagreement and attribution. Distinguish shared knowledge from private knowledge without smoothing over uncertainty.',
    allowedActionTypes: ['wait', 'move', 'share_signal', 'request_mission'],
    limits: sharedLimits,
  },
} as const satisfies Record<AgentRole, AgentRoleProfile>;

const profiles = new Map<string, AgentRoleProfile>(
  Object.values(versionOneProfiles).map((profile) => [
    `${profile.role}:${profile.version}`,
    profile,
  ]),
);

/** Resolve a profile exactly; unknown versions fail closed instead of silently changing behavior. */
export function getAgentRoleProfile(role: AgentRole, version: number): AgentRoleProfile {
  const profile = profiles.get(`${role}:${version}`);
  if (!profile) throw new Error(`Unsupported agent role profile ${role} version ${version}.`);
  return structuredClone(profile);
}

/** Enforce profile permissions and concise public output independently of prompt compliance. */
export function validateAgentProfileOutput(
  profile: AgentRoleProfile,
  output: AgentTurnOutput,
): string[] {
  const errors: string[] = [];
  if (!profile.allowedActionTypes.includes(output.action.type)) {
    errors.push(`action.type: profile ${profile.profileId} does not permit ${output.action.type}.`);
  }
  if (output.publicDialogue.length > profile.limits.publicDialogueChars) {
    errors.push(
      `publicDialogue: profile ${profile.profileId} permits at most ${profile.limits.publicDialogueChars} characters.`,
    );
  }
  if (/\r|\n/u.test(output.publicDialogue)) {
    errors.push('publicDialogue: public dialogue must be one compact paragraph.');
  }
  if (output.rationale.length > profile.limits.publicRationaleChars) {
    errors.push(
      `rationale: profile ${profile.profileId} permits at most ${profile.limits.publicRationaleChars} characters.`,
    );
  }
  if (output.unknowns.length === 0) {
    errors.push('unknowns: every turn must state at least one material unknown.');
  }
  if (output.unknowns.length > profile.limits.unknowns) {
    errors.push(
      `unknowns: profile ${profile.profileId} permits at most ${profile.limits.unknowns} entries.`,
    );
  }
  return errors;
}
