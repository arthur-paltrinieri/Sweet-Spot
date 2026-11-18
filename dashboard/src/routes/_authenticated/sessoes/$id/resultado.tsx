
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, Flame, Target, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { StatCard } from "@/components/stat-card";
import { TargetsBarChart } from "@/components/charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/services/api";
import {
  SESSION_STATUS_LABEL,
  formatDateTime,
} from "@/lib/domain";

type Session = {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
  ended_at: string | null;
  total_points: number | string | null;
  accuracy: number | string | null;
  best_streak: number | null;
  bonus_points: number | null;
};

type SessionHit = {
  id: string;
  target_index: number;
  hit: boolean | number;
  accuracy: number | string | null;
  reaction_ms: number | null;
  points: number | string | null;
};

type SessionResultData = {
  session: Session | null;
  hits: SessionHit[];
};

export const Route = createFileRoute(
  "/_authenticated/sessoes/$id/resultado"
)({
  component: () => (
    <RoleGuard
      allowedRoles={["praticante", "treinador", "admin"]}
    >
      <SessionResult />
    </RoleGuard>
  ),
});

function SessionResult() {
  const { id } = Route.useParams();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery<SessionResultData>({
    queryKey: ["session-result", id],
    queryFn: async () => {
      const [sessionRes, hitsRes] = await Promise.all([
        api.get(`/sessoes/${encodeURIComponent(id)}`),
        api.get(`/sessoes/${encodeURIComponent(id)}/hits`),
      ]);

      return {
        session: sessionRes.data.session ?? null,
        hits: hitsRes.data.hits ?? [],
      };
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const session = data?.session ?? null;
  const hits = data?.hits ?? [];
  const isFinished = session?.status === "concluida";

  const byTarget = new Map<number, number>();

  hits.forEach((attempt) => {
    const isHit =
      attempt.hit === true ||
      Number(attempt.hit) === 1;

    const index = Number(attempt.target_index);

    if (isHit && Number.isInteger(index) && index >= 0) {
      byTarget.set(index, (byTarget.get(index) ?? 0) + 1);
    }
  });

  const targets = [...byTarget.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, value]) => ({
      label: `Alvo ${index + 1}`,
      value,
    }));

  const totalHits = hits.filter(
    (attempt) =>
      attempt.hit === true ||
      Number(attempt.hit) === 1
  ).length;

  const totalMisses = hits.length - totalHits;

  const reactionTimes = hits
    .map((attempt) => attempt.reaction_ms)
    .filter(
      (value): value is number =>
        value !== null &&
        value !== undefined &&
        Number.isFinite(Number(value)) &&
        Number(value) >= 0
    )
    .map(Number);

  const avgReaction =
    reactionTimes.length > 0
      ? Math.round(
          reactionTimes.reduce(
            (total, value) => total + value,
            0
          ) / reactionTimes.length
        )
      : null;

  const accuracy = Number(session?.accuracy ?? 0);
  const bestStreak = Number(session?.best_streak ?? 0);

  const medals = [
    {
      label: "Precisão de elite",
      won: isFinished && accuracy >= 80,
    },
    {
      label: "Combo x5",
      won: isFinished && bestStreak >= 5,
    },
    {
      label: "Reflexo rápido",
      won:
        isFinished &&
        avgReaction !== null &&
        avgReaction < 700,
    },
  ];

  const actions = (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline">
        <Link to="/minhas-sessoes">
          Histórico
        </Link>
      </Button>

      <Button asChild>
        <Link to="/sessoes/nova">
          Nova sessão
        </Link>
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <AppShell
        title="Resultado da sessão"
        subtitle="Carregando resultados"
        actions={actions}
      >
        <div className="py-12 text-center text-muted-foreground">
          Carregando resultados da sessão...
        </div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell
        title="Resultado da sessão"
        subtitle="Falha ao consultar os resultados"
        actions={actions}
      >
        <div className="flex flex-col items-center gap-4 py-12">
          <p className="text-center text-destructive">
            Não foi possível carregar os resultados.
          </p>

          <Button
            variant="outline"
            onClick={() => void refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!session) {
    return (
      <AppShell
        title="Resultado da sessão"
        subtitle="Sessão não encontrada"
        actions={actions}
      >
        <p className="py-12 text-center text-muted-foreground">
          A sessão solicitada não foi encontrada.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Resultado da sessão"
      subtitle={`${session.title || "Sessão de treino"} · ${
        session.ended_at
          ? formatDateTime(session.ended_at)
          : "Ainda não finalizada"
      }`}
      actions={actions}
    >
      <div className="space-y-6">
        {!isFinished && (
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm text-muted-foreground">
                Esta sessão ainda não foi concluída.
              </p>

              <Button asChild variant="outline" size="sm">
                <Link
                  to="/sessoes/$id/executar"
                  params={{ id }}
                >
                  Voltar à sessão
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Pontos"
            value={Number(session.total_points ?? 0)}
            icon={Trophy}
            accent
          />

          <StatCard
            label="Precisão"
            value={`${accuracy.toFixed(1)}%`}
            icon={Target}
          />

          <StatCard
            label="Melhor combo"
            value={`x${bestStreak}`}
            icon={Flame}
          />

          <StatCard
            label="Bônus"
            value={Number(session.bonus_points ?? 0)}
            icon={Award}
          />
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          <span>
            Rebatidas: <strong>{hits.length}</strong>
          </span>

          <span>
            Acertos: <strong>{totalHits}</strong>
          </span>

          <span>
            Erros: <strong>{totalMisses}</strong>
          </span>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <TargetsBarChart
            data={targets}
            description="Acertos por alvo nesta sessão"
          />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Conquistas
              </CardTitle>

              <CardDescription>
                Medalhas desbloqueadas nesta sessão
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-2">
              {medals.map((medal) => (
                <div
                  key={medal.label}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm"
                >
                  <span className="font-medium">
                    {medal.label}
                  </span>

                  <Badge
                    variant={
                      medal.won ? "default" : "secondary"
                    }
                  >
                    {medal.won
                      ? "Conquistada"
                      : "Bloqueada"}
                  </Badge>
                </div>
              ))}

              <div className="rounded-lg border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
                Tempo médio de reação:{" "}
                {avgReaction !== null
                  ? `${avgReaction} ms`
                  : "Não medido"}
                {" · "}
                Status:{" "}
                {SESSION_STATUS_LABEL[
                  session.status as keyof typeof SESSION_STATUS_LABEL
                ] || session.status}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
