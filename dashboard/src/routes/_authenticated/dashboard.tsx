
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Zap,
  Target,
  TrendingUp,
  Trophy,
  ArrowRight,
} from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api } from "@/services/api";

type DashboardOverview = {
  total_sessions: number | string | null;
  all_time_points: number | string | null;
  average_accuracy: number | string | null;
  highest_streak: number | string | null;
};

type RecentSession = {
  id: string | number;
  title: string | null;
  ended_at: string | null;
  total_points: number | string | null;
  accuracy: number | string | null;
};

type DashboardData = {
  overview: DashboardOverview;
  recent_sessions: RecentSession[];
};

export const Route = createFileRoute(
  "/_authenticated/dashboard"
)({
  component: DashboardPage,
});

function DashboardPage() {
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery<DashboardData>({
    queryKey: ["dashboard", "me"],
    queryFn: async () => {
      const response = await api.get<DashboardData>(
        "/dashboard/me"
      );

      return response.data;
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const overview = data?.overview;
  const recentSessions = data?.recent_sessions ?? [];

  const totalPoints = Math.max(
    0,
    Number(overview?.all_time_points ?? 0)
  );

  const totalSessions = Number(
    overview?.total_sessions ?? 0
  );

  const averageAccuracy = Number(
    overview?.average_accuracy ?? 0
  );

  const highestStreak = Number(
    overview?.highest_streak ?? 0
  );

  const currentLevel = Math.floor(totalPoints / 500) + 1;
  const currentLevelProgress =
    ((totalPoints % 500) / 500) * 100;

  const pointsToNextLevel =
    500 - (totalPoints % 500);

  const actions = (
    <Button asChild className="bg-primary text-primary-foreground hover:bg-primary/90">
      <Link to="/sessoes/nova">
        Nova sessão
      </Link>
    </Button>
  );

  if (isLoading) {
    return (
      <AppShell
        title="Meu Painel"
        subtitle="Desempenho gamificado nas sessões da maquete"
        actions={actions}
      >
        <div className="p-8 text-center text-muted-foreground animate-pulse">
          Preparando sua arena...
        </div>
      </AppShell>
    );
  }

  if (isError || !overview) {
    return (
      <AppShell
        title="Meu Painel"
        subtitle="Desempenho gamificado nas sessões da maquete"
        actions={actions}
      >
        <div className="flex flex-col items-center gap-4 py-12">
          <p className="text-center text-destructive">
            Não foi possível carregar as estatísticas.
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

  return (
    <AppShell
      title="Meu Painel"
      subtitle="Desempenho gamificado nas sessões da maquete"
      actions={actions}
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Pontos Totais
              </CardTitle>

              <Trophy className="h-4 w-4 text-primary" />
            </CardHeader>

            <CardContent>
              <div className="stat-number text-3xl font-bold text-primary">
                {totalPoints}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Precisão Média
              </CardTitle>

              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>

            <CardContent>
              <div className="stat-number text-3xl font-bold">
                {averageAccuracy.toFixed(1)}%
              </div>

              <p className="mt-1 text-xs text-muted-foreground">
                Nos alvos de LED
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Maior Sequência
              </CardTitle>

              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>

            <CardContent>
              <div className="stat-number text-3xl font-bold">
                x{highestStreak}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Sessões Concluídas
              </CardTitle>

              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>

            <CardContent>
              <div className="stat-number text-3xl font-bold">
                {totalSessions}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="space-y-3 p-6">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-bold">
                  Nível {currentLevel}
                </span>

                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                  Ativo
                </span>
              </div>

              <span className="text-sm text-muted-foreground">
                {totalPoints} XP acumulados · próximo nível em{" "}
                {pointsToNextLevel} XP
              </span>
            </div>

            <Progress
              value={currentLevelProgress}
              className="h-2"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">
                Últimas sessões
              </CardTitle>

              <CardDescription>
                Resumo rápido do seu histórico recente
              </CardDescription>
            </div>

            <Button asChild variant="ghost" size="sm">
              <Link to="/minhas-sessoes" className="gap-1">
                Ver histórico
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>

          <CardContent className="space-y-3">
            {recentSessions.length > 0 ? (
              recentSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm transition-colors hover:bg-muted/50"
                >
                  <div>
                    <p className="text-base font-medium">
                      {session.title || "Sessão de treino"}
                    </p>

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {session.ended_at
                        ? new Date(
                            session.ended_at
                          ).toLocaleDateString(
                            "pt-BR",
                            {
                              weekday: "short",
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }
                          )
                        : "Data indisponível"}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="font-bold text-primary">
                      {Number(
                        session.total_points ?? 0
                      )}{" "}
                      pts
                    </span>

                    <span className="ml-3 text-xs text-muted-foreground">
                      {Number(
                        session.accuracy ?? 0
                      ).toFixed(1)}
                      % acerto
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed bg-muted/20 p-8 text-center">
                <p className="text-sm text-muted-foreground">
                  Ainda não registrou nenhuma sessão
                  de treino concluída.
                </p>

                <Button asChild size="sm" className="mt-4">
                  <Link to="/sessoes/nova">
                    Iniciar primeiro treino
                  </Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
