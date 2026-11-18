
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, Target, Trophy, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { StatCard } from "@/components/stat-card";
import { AccuracyTrendChart } from "@/components/charts";
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
import { useCurrentUser } from "@/hooks/use-auth";
import { fetchStudents } from "@/lib/queries";
import { LEVEL_LABEL } from "@/lib/domain";

type Student = {
  id: string;
  full_name: string | null;
  tennis_level: string | null;
};

type StudentSession = {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  ended_at: string | null;
  accuracy: number | string | null;
  total_points: number | string | null;
};

type StudentSummary = Student & {
  sessions: number;
  accuracy: number;
  points: number;
};

export const Route = createFileRoute(
  "/_authenticated/treinador/"
)({
  component: () => (
    <RoleGuard allowedRoles={["treinador", "admin"]}>
      <CoachOverview />
    </RoleGuard>
  ),
});

function CoachOverview() {
  const {
    data: me,
    isLoading: isLoadingUser,
  } = useCurrentUser();

  const studentsQuery = useQuery<Student[]>({
    queryKey: ["coach-students", me?.userId],
    enabled: !!me?.userId,
    queryFn: () => fetchStudents(me?.userId),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const sessionsQuery = useQuery<StudentSession[]>({
    queryKey: ["coach-sessions", me?.userId],
    enabled: !!me?.userId,
    queryFn: async () => {
      const { data } = await api.get(
        "/treinador/sessoes"
      );

      return data.sessions ?? [];
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const students = studentsQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];

  const isLoading =
    isLoadingUser ||
    studentsQuery.isLoading ||
    sessionsQuery.isLoading;

  const isError =
    studentsQuery.isError ||
    sessionsQuery.isError;

  const done = sessions.filter(
    (session) => session.status === "concluida"
  );

  const avgAccuracy = done.length
    ? done.reduce(
        (total, session) =>
          total + Number(session.accuracy ?? 0),
        0
      ) / done.length
    : 0;

  const points = done.reduce(
    (total, session) =>
      total + Number(session.total_points ?? 0),
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
    value: Number(session.accuracy ?? 0),
  }));

  const byStudent: StudentSummary[] = students.map(
    (student) => {
      const rows = done.filter(
        (session) =>
          String(session.user_id) ===
          String(student.id)
      );

      const accuracy = rows.length
        ? rows.reduce(
            (total, session) =>
              total + Number(session.accuracy ?? 0),
            0
          ) / rows.length
        : 0;

      return {
        ...student,
        sessions: rows.length,
        accuracy,
        points: rows.reduce(
          (total, session) =>
            total + Number(
              session.total_points ?? 0
            ),
          0
        ),
      };
    }
  );

  const ranking = [...byStudent]
    .filter((student) => student.sessions > 0)
    .sort(
      (a, b) =>
        b.accuracy - a.accuracy ||
        b.sessions - a.sessions
    )
    .slice(0, 5);

  const retry = () => {
    void studentsQuery.refetch();
    void sessionsQuery.refetch();
  };

  return (
    <AppShell
      title="Indicadores da turma"
      subtitle="Acompanhe o desempenho dos seus alunos na arena"
      actions={
        <Button asChild>
          <Link to="/treinador/enviar-treino">
            Enviar treino
          </Link>
        </Button>
      }
    >
      {isLoading ? (
        <div className="py-12 text-center text-muted-foreground">
          Carregando indicadores da turma...
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-4 py-12">
          <p className="text-center text-destructive">
            Não foi possível carregar os dados da turma.
          </p>

          <Button
            variant="outline"
            onClick={retry}
          >
            Tentar novamente
          </Button>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Alunos vinculados"
              value={students.length}
              icon={Users}
              accent
            />

            <StatCard
              label="Sessões concluídas"
              value={done.length}
              icon={Activity}
            />

            <StatCard
              label="Precisão média"
              value={`${avgAccuracy.toFixed(1)}%`}
              icon={Target}
            />

            <StatCard
              label="Pontos da turma"
              value={points}
              icon={Trophy}
            />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <AccuracyTrendChart
              data={trend}
              description="Precisão das últimas sessões da turma (%)"
            />

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Ranking de precisão
                </CardTitle>

                <CardDescription>
                  Alunos com melhor aproveitamento nos alvos
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-2">
                {ranking.map((student, index) => (
                  <div
                    key={student.id}
                    className="flex items-center justify-between rounded-lg border border-border px-4 py-2 text-sm"
                  >
                    <span className="font-medium">
                      {index + 1}.{" "}
                      {student.full_name || "Aluno"}
                    </span>

                    <span className="text-muted-foreground">
                      {student.accuracy.toFixed(1)}%
                    </span>
                  </div>
                ))}

                {ranking.length === 0 && (
                  <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    Nenhum aluno possui sessões concluídas
                    ainda.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="mt-6">
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">
                  Desempenho por aluno
                </CardTitle>

                <CardDescription>
                  Tabela consolidada das sessões
                </CardDescription>
              </div>

              <Button
                asChild
                variant="outline"
                size="sm"
              >
                <Link to="/treinador/alunos">
                  Ver alunos
                </Link>
              </Button>
            </CardHeader>

            <CardContent>
              {byStudent.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Nenhum aluno vinculado ainda.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Nível</TableHead>
                      <TableHead className="text-right">
                        Sessões
                      </TableHead>
                      <TableHead className="text-right">
                        Precisão
                      </TableHead>
                      <TableHead className="text-right">
                        Pontos
                      </TableHead>
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {byStudent.map((student) => (
                      <TableRow key={student.id}>
                        <TableCell className="font-medium">
                          <Link
                            to="/treinador/alunos/$id"
                            params={{ id: String(student.id) }}
                          >
                            {student.full_name || "Aluno"}
                          </Link>
                        </TableCell>

                        <TableCell>
                          {student.tennis_level
                            ? LEVEL_LABEL[
                                student.tennis_level as keyof typeof LEVEL_LABEL
                              ] || student.tennis_level
                            : "—"}
                        </TableCell>

                        <TableCell className="text-right">
                          {student.sessions}
                        </TableCell>

                        <TableCell className="text-right">
                          {student.sessions > 0
                            ? `${student.accuracy.toFixed(1)}%`
                            : "—"}
                        </TableCell>

                        <TableCell className="text-right">
                          {student.points}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </AppShell>
  );
}
