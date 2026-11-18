
import { api } from "@/services/api";

export type SessionSummary = {
  accuracy: number | string | null;
  total_points: number | string | null;
  best_streak: number | string | null;
};

export async function fetchMySessions(
  _userId?: string
) {
  const { data } = await api.get("/sessions/me");
  return data.sessions ?? [];
}

export async function fetchStudents(
  _coachId?: string
) {
  const { data } = await api.get("/treinador/alunos");
  return data.students ?? [];
}

export async function fetchTrainings() {
  const { data } = await api.get("/trainings");
  return data.trainings ?? [];
}

export function summarize(
  sessions: SessionSummary[]
) {
  const done = sessions.length;

  const points = sessions.reduce(
    (total, session) =>
      total + Number(session.total_points ?? 0),
    0
  );

  const accuracy = done
    ? sessions.reduce(
        (total, session) =>
          total + Number(session.accuracy ?? 0),
        0
      ) / done
    : 0;

  const streak = sessions.reduce(
    (best, session) =>
      Math.max(
        best,
        Number(session.best_streak ?? 0)
      ),
    0
  );

  return {
    done,
    points,
    accuracy,
    streak,
  };
}
