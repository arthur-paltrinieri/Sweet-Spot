
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Percent, Target, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import {
  AccuracyTrendChart,
  TargetsBarChart,
} from "@/components/charts";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/services/api";
import { formatDateTime } from "@/lib/domain";

type Training = {
  id: string;
  title: string;
  target_count: number | null;
};

type TrainingSession = {
  id: string;
  user_id: string;
  title: string | null;
  status: string;
  created_at: string;
  ended_at: string | null;
  accuracy: number | string | null;
  total_points: number | string | null;
  best_streak: number | null;
};

type TrainingHit = {
  id: string;
  session_id: string;
  target_index: number;
  hit: boolean | number;
};

export const Route = createFileRoute(
  "/_authenticated/treinos/$id/analise"
)({
  component: () => (
    <RoleGuard allowedRoles={["treinador", "admin"]}>
      <TrainingAnalysis />
    </RoleGuard>
  ),
});

function TrainingAnalysis() {
  const { id } = Route.useParams();
  const trainingId = encodeURIComponent(id);

  const trainingQuery = useQuery<Training>({
    queryKey: ["training", id],
    queryFn: async () => {
      const { data } = await api.get(
        `/trainings/${trainingId}`
      );

      return data.training;
    },
    retry: 1,
  });

  const sessionsQuery = useQuery<TrainingSession[]>({
    queryKey: ["training-sessions", id],
    queryFn: async () => {
      const { data } = await api.get(
        `/trainings/${trainingId}/sessoes`
      );

      return data.sessions ?? [];
    },
    retry: 1,
  });

  const hitsQuery = useQuery<TrainingHit[]>({
    queryKey: ["training-hits", id],
    queryFn: async () => {
      const { data } = await api.get(
        `/trainings/${trainingId}/hits`
      );

      return data.hits ?? [];
    },
    enabled:
      sessionsQuery.isSuccess &&
      sessionsQuery.data.length > 0,
    retry: 1,
  });

  const training = trainingQuery.data;
  const sessions = sessionsQuery.data ?? [];
  const hits = hitsQuery.data ?? [];

  const isLoading =
    trainingQuery.isLoading ||
    sessionsQuery.isLoading ||
    hitsQuery.isLoading;

  const hasError =
    trainingQuery.isError ||
    sessionsQuery.isError ||
    hitsQuery.isError;

  const done = sessions.filter(
    (session) => session.status === "concluida"
  );

  const averageAccuracy = done.length
    ? done.reduce(
        (total, session) =>
          total + Number(session.accuracy ?? 0),
        0
      ) / done.length
    : 0;

  const totalPoints = done.reduce(
    (total, session) =>
      total + Number(session.total_points ?? 0),
    0
  );

  const athletes = new Set(
    done.map((session) => String(session.user_id))
  ).size;

  const recentDone = [...done]
    .sort(
      (a, b) =>
        new Date(
          b.ended_at ?? b.created_at
        ).getTime() -
        new Date(
          a.ended_at ?? a.created_at
        ).getTime()
    )
    .slice(0, 12)
    .reverse();

  const trend = recentDone.map((session, index) => ({
    label: `S${index + 1}`,
    value: Number(session.accuracy ?? 0),
  }));

  const completedSessionIds = new Set(
    done.map((session) => String(session.id))
  );

  const perTarget = new Map<number, number>();

  hits.forEach((attempt) => {
    const isHit =
      attempt.hit === true ||
      Number(attempt.hit) === 1;

    const index = Number(attempt.target_index);

    if (
      isHit &&
      completedSessionIds.has(String(attempt.session_id)) &&
      Number.isInteger(index) &&
      index >= 0 &&
      index < 31
    ) {
      perTarget.set(
        index,
        (perTarget.get(index) ?? 0) + 1
      );
    }
  });

  const targetsData = [...perTarget.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, value]) => ({
      label: `Alvo ${index + 1}`,
      value,
    }));

  const sortedSessions = [...sessions].sort(
    (a, b) =>
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
  );

  const retry = () => {
    void trainingQuery.refetch();
    void sessionsQuery.refetch();
    if (sessions.length > 0) {
      void hitsQuery.refetch();
    }
  };

  const actions = (
    <Button asChild variant="outline">
      <Link to="/treinos">
        Voltar aos treinos
      </Link>
    </Button>
  );

  if (isLoading) {
    return (
      <AppShell
        title="Análise do treino"
        subtitle="Carregando indicadores"
        actions={actions}
      >
        <div className="py-12 text-center text-muted-foreground">
          Carregando análise do treino...
        </div>
      </AppShell>
    );
  }

  if (hasError) {
    return (
      <AppShell
        title="Análise do treino"
        subtitle="Falha ao carregar indicadores"
        actions={actions}
      >
        <div className="flex flex-col items-center gap-4 py-12">
          <p className="text-center text-destructive">
            Não foi possível carregar os dados do treino.
          </p>

          <Button
            variant="outline"
            onClick={retry}
          >
            Tentar novamente
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!training) {
    return (
      <AppShell
        title="Análise do treino"
        subtitle="Treino não encontrado"
        actions={actions}
      >
        <p className="py-12 text-center text-muted-foreground">
          O treino solicitado não foi encontrado.
        </p>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Análise do treino"
      subtitle={training.title}
      actions={actions}
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Sessões concluídas"
            value={done.length}
            icon={Activity}
            accent
          />

          <StatCard
            label="Precisão média"
            value={`${averageAccuracy.toFixed(1)}%`}
            icon={Percent}
          />

          <StatCard
            label="Pontos gerados"
            value={totalPoints}
            icon={Target}
          />

          <StatCard
            label="Atletas alcançados"
            value={athletes}
            icon={Users}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <AccuracyTrendChart
            data={trend}
            title="Evolução da precisão"
            description="Últimas sessões concluídas com este treino"
          />

          <TargetsBarChart
            data={targetsData}
            description="Acertos por alvo nas sessões concluídas"
          />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Sessões registradas
            </CardTitle>

            <CardDescription>
              Execuções da arena vinculadas a este treino
            </CardDescription>
          </CardHeader>

          <CardContent>
            {sortedSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma sessão executada com este treino ainda.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sessão</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-right">
                      Precisão
                    </TableHead>
                    <TableHead className="text-right">
                      Pontos
                    </TableHead>
                    <TableHead className="text-right">
                      Melhor combo
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {sortedSessions.map((session) => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">
                        {session.title || "Sessão de treino"}
                      </TableCell>

                      <TableCell>
                        {formatDateTime(session.created_at)}
                      </TableCell>

                      <TableCell className="text-right">
                        {session.accuracy !== null
                          ? `${Number(
                              session.accuracy
                            ).toFixed(1)}%`
                          : "—"}
                      </TableCell>

                      <TableCell className="text-right">
                        {session.total_points ?? "—"}
                      </TableCell>

                      <TableCell className="text-right">
                        {session.best_streak !== null
                          ? `x${session.best_streak}`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
