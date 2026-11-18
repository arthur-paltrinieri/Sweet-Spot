
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Flame, Target, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { StatCard } from "@/components/stat-card";
import {
  AccuracyTrendChart,
  TargetsBarChart,
} from "@/components/charts";
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
import {
  LEVEL_LABEL,
  SESSION_STATUS_LABEL,
  formatDateTime,
} from "@/lib/domain";

type StudentProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  tennis_level: string | null;
  institution: string | null;
};

type StudentSession = {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
  ended_at: string | null;
  accuracy: number | string | null;
  total_points: number | string | null;
  best_streak: number | null;
};

type StudentHit = {
  id: string;
  session_id: string;
  target_index: number;
  hit: boolean | number;
  accuracy: number | string | null;
  points: number | string | null;
};

type StudentData = {
  profile: StudentProfile | null;
  sessions: StudentSession[];
  hits: StudentHit[];
};

export const Route = createFileRoute(
  "/_authenticated/treinador/alunos/$id"
)({
  component: () => (
    <RoleGuard allowedRoles={["treinador", "admin"]}>
      <StudentDetail />
    </RoleGuard>
  ),
});

function StudentDetail() {
  const { id } = Route.useParams();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery<StudentData>({
    queryKey: ["student-detail", id],
    queryFn: async () => {
      const studentId = encodeURIComponent(id);

      const [profileRes, sessionsRes, hitsRes] =
        await Promise.all([
          api.get(`/treinador/alunos/${studentId}`),
          api.get(`/treinador/alunos/${studentId}/sessoes`),
          api.get(`/treinador/alunos/${studentId}/hits`),
        ]);

      return {
        profile: profileRes.data.profile ?? null,
        sessions: sessionsRes.data.sessions ?? [],
        hits: hitsRes.data.hits ?? [],
      };
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const profile = data?.profile ?? null;
  const sessions = data?.sessions ?? [];
  const hits = data?.hits ?? [];

  const done = sessions.filter(
    (session) => session.status === "concluida"
  );

  const totalPoints = done.reduce(
    (total, session) =>
      total + Number(session.total_points ?? 0),
    0
  );

  const avgAccuracy = done.length
    ? done.reduce(
        (total, session) =>
          total + Number(session.accuracy ?? 0),
        0
      ) / done.length
    : 0;

  const bestStreak = done.reduce(
    (best, session) =>
      Math.max(best, Number(session.best_streak ?? 0)),
    0
  );

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
    .slice(0, 10)
    .reverse();

  const trend = recentDone.map((session, index) => ({
    label: `S${index + 1}`,
    value: Number(
      Number(session.accuracy ?? 0).toFixed(1)
    ),
  }));

  const byTarget = new Map<number, number>();

  hits.forEach((attempt) => {
    const isHit =
      attempt.hit === true ||
      Number(attempt.hit) === 1;

    const target = Number(attempt.target_index);

    if (
      isHit &&
      Number.isInteger(target) &&
      target >= 0 &&
      target < 31
    ) {
      byTarget.set(
        target,
        (byTarget.get(target) ?? 0) + 1
      );
    }
  });

  const targets = [...byTarget.entries()]
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

  const actions = (
    <Button asChild variant="outline">
      <Link to="/treinador/alunos">
        Voltar
      </Link>
    </Button>
  );

  if (isLoading) {
    return (
      <AppShell
        title="Desempenho do aluno"
        subtitle="Carregando dados"
        actions={actions}
      >
        <div className="py-12 text-center text-muted-foreground">
          Carregando informações do aluno...
        </div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell
        title="Desempenho do aluno"
        subtitle="Falha ao carregar informações"
        actions={actions}
      >
        <div className="flex flex-col items-center gap-4 py-12">
          <p className="text-center text-destructive">
            Não foi possível carregar os dados do aluno.
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

  if (!profile) {
    return (
      <AppShell
        title="Aluno não encontrado"
        subtitle="Desempenho individual"
        actions={actions}
      >
        <div className="py-12 text-center text-muted-foreground">
          O aluno solicitado não foi encontrado
          ou você não possui acesso aos seus dados.
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={profile.full_name || "Aluno"}
      subtitle={
        profile.tennis_level
          ? `Nível ${
              LEVEL_LABEL[
                profile.tennis_level as keyof typeof LEVEL_LABEL
              ] || profile.tennis_level
            }`
          : "Desempenho individual"
      }
      actions={actions}
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Pontos"
            value={totalPoints}
            icon={Trophy}
            accent
          />

          <StatCard
            label="Precisão média"
            value={`${avgAccuracy.toFixed(1)}%`}
            icon={Target}
          />

          <StatCard
            label="Melhor sequência"
            value={`x${bestStreak}`}
            icon={Flame}
          />

          <StatCard
            label="Sessões concluídas"
            value={done.length}
            icon={Activity}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <AccuracyTrendChart
            data={trend}
            title="Evolução da precisão"
            description="Últimas dez sessões concluídas"
          />

          <TargetsBarChart
            data={targets}
            description="Acertos por alvo registrados na arena"
          />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Sessões do aluno
            </CardTitle>

            <CardDescription>
              Histórico de treinamentos registrados
              na arena Sweet Spot
            </CardDescription>
          </CardHeader>

          <CardContent>
            {sortedSessions.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Este aluno ainda não registrou sessões.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sessão</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">
                      Precisão
                    </TableHead>
                    <TableHead className="text-right">
                      Pontos
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

                      <TableCell>
                        {SESSION_STATUS_LABEL[
                          session.status as keyof typeof SESSION_STATUS_LABEL
                        ] || session.status}
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
