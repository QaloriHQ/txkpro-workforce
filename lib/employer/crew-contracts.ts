import type { Definition } from "@/lib/incentives/contracts";

export type EmployerCrewPerson = {
  userId: string;
  name: string;
  role: string;
};

export type EmployerCrewMember = EmployerCrewPerson & {
  active: boolean;
};

export type EmployerCrew = {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  members: EmployerCrewMember[];
  createdAt: string;
  updatedAt: string;
};

export type EmployerCrewWorkspace = {
  employerId: string;
  canManage: boolean;
  people: EmployerCrewPerson[];
  crews: EmployerCrew[];
};

export type ProgramParticipantForCrew = {
  id: string;
  userId?: string;
  status: string;
};

export function selectedCrewsToTeams(
  crews: EmployerCrew[],
  selectedIds: string[],
  participants: ProgramParticipantForCrew[],
  current: Definition["teams"],
): Definition["teams"] {
  const directoryIds = new Set(crews.map((crew) => crew.id));
  const selected = new Set(selectedIds);
  const legacy = current.filter(
    (team) =>
      !team.directoryCrewId &&
      !directoryIds.has(team.id),
  );
  const activeParticipantByUser = new Map(
    participants
      .filter(
        (participant) =>
          participant.status === "active" && Boolean(participant.userId),
      )
      .map((participant) => [participant.userId!, participant.id]),
  );

  const linked = crews.flatMap((crew) => {
    if (!selected.has(crew.id)) return [];
    const participantIds = crew.members.flatMap((member) => {
      const participantId = activeParticipantByUser.get(member.userId);
      return member.active && participantId ? [participantId] : [];
    });
    return [
      {
        id: crew.id,
        directoryCrewId: crew.id,
        name: crew.name,
        participantIds: [...new Set(participantIds)],
      },
    ];
  });

  return [...legacy, ...linked];
}
