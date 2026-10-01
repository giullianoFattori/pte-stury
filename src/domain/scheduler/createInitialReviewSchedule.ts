type InitialReviewSchedule = {
  dueAt: string;
  intervalDays: number;
  repetitions: number;
  correctStreak: number;
};

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function createInitialReviewSchedule(createdAt: string): InitialReviewSchedule {
  return {
    dueAt: new Date(new Date(createdAt).getTime() + DAY_IN_MS).toISOString(),
    intervalDays: 1,
    repetitions: 0,
    correctStreak: 0,
  };
}
