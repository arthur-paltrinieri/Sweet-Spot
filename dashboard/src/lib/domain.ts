
export type AppRole =
  | "praticante"
  | "treinador"
  | "admin";

export type TennisLevel =
  | "iniciante"
  | "intermediario"
  | "avancado"
  | "competitivo";

export type TrainingStatus =
  | "rascunho"
  | "revisao"
  | "publicado";

export type SessionStatus =
  | "configurada"
  | "em_andamento"
  | "concluida"
  | "cancelada";

export const ROLE_LABEL: Record<AppRole, string> = {
  praticante: "Praticante",
  treinador: "Professor / Instituição",
  admin: "Administrador",
};

export const LEVEL_LABEL: Record<TennisLevel, string> = {
  iniciante: "Iniciante",
  intermediario: "Intermediário",
  avancado: "Avançado",
  competitivo: "Competitivo",
};

export const TRAINING_STATUS_LABEL: Record<
  TrainingStatus,
  string
> = {
  rascunho: "Rascunho",
  revisao: "Em revisão",
  publicado: "Publicado",
};

export const SESSION_STATUS_LABEL: Record<
  SessionStatus,
  string
> = {
  configurada: "Configurada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

export const HOME_BY_ROLE: Record<AppRole, string> = {
  praticante: "/dashboard",
  treinador: "/treinador",
  admin: "/admin",
};

export const MAX_PHYSICAL_TARGETS = 31;

export function computeHitPoints(options: {
  hit: boolean;
  accuracy: number;
  reactionMs: number | null;
  streak: number;
}) {
  if (!options.hit) {
    return {
      points: 0,
      bonus: 0,
    };
  }

  const accuracy = Number.isFinite(options.accuracy)
    ? Math.min(100, Math.max(0, options.accuracy))
    : 0;

  const streak = Number.isFinite(options.streak)
    ? Math.max(0, Math.floor(options.streak))
    : 0;

  const reactionMs =
    options.reactionMs !== null &&
    Number.isFinite(options.reactionMs) &&
    options.reactionMs >= 0
      ? options.reactionMs
      : null;

  const base = Math.round(10 * (accuracy / 100));

  const streakBonus = Math.min(streak, 5) * 5;

  const speedBonus =
    reactionMs === null
      ? 0
      : reactionMs < 600
        ? 8
        : reactionMs < 900
          ? 4
          : 0;

  const bonus = streakBonus + speedBonus;

  return {
    points: base + bonus,
    bonus,
  };
}

export function levelFromXp(xp: number) {
  const perLevel = 500;

  const totalXp = Number.isFinite(xp)
    ? Math.max(0, xp)
    : 0;

  const level = Math.floor(totalXp / perLevel) + 1;

  const progress =
    ((totalXp % perLevel) / perLevel) * 100;

  return {
    level,
    progress,
    nextAt: level * perLevel,
  };
}

export function formatDate(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
