
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, ClipboardList, Percent, Users } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { AccuracyTrendChart } from "@/components/charts";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
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
  TRAINING_STATUS_LABEL,
  formatDateTime,
} from "@/lib/domain";

type Profile = {
  id: string;
  full_name: string;
  email: string;
};

type Session = {
  id: string;
  accuracy: number | string | null;
  status: string;
  created_at: string;
  total_points: number;
};

type Training = {
  id: string;
  title: string;
  status: string;
  updated_at: string;
  version: string | number | null;
};

export const Route = createFileRoute("/_authenticated/admin/")({
  component: () => (
    <RoleGuard allowedRoles={["admin"]}>
      <AdminOverview />
    </RoleGuard>
  ),
});

function AdminOverview() {
  const profilesQuery = useQuery<Profile[]>({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data } = await api.get("/admin/profiles");
      return data.profiles ?? [];
    },
  });

  const sessionsQuery = useQuery<Session[]>({
    queryKey: ["admin-sessions"],
    queryFn: async () => {
      const { data } = await api.get("/admin/sessions");
      return data.sessions ?? [];
    },
  });

  const trainingsQuery = useQuery<Training[]>({
    queryKey: ["admin-trainings"],
    queryFn: async () => {
      const { data } = await api.get("/admin/trainings");
      return data.trainings ?? [];
    },
  });

  const profiles = profilesQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const trainings = trainingsQuery.data ?? [];

  const isLoading =
    profilesQuery.isLoading ||
    sessionsQuery.isLoading ||
    trainingsQuery.isLoading;

  const hasError =
    profilesQuery.isError ||
    sessionsQuery.isError ||
    trainingsQuery.isError;

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

  const recentDone = [...done]
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    )
    .slice(0, 12)
    .reverse();

  const trend = recentDone.map((session, index) => ({
    label: `S${index + 1}`,
    value: Math.round(Number(session.accuracy ?? 0)),
  }));

  if (isLoading) {
    return (
      <AppShell
        title="Visão geral"
        subtitle="Gestão administrativa da plataforma Smart Tennis Arena"
      >
        <div className="py-12 text-center text-muted-foreground">
          Carregando dados administrativos...
        </div>
      </AppShell>
    );
  }

  if (hasError) {
    return (
      <AppShell
        title="Visão geral"
        subtitle="Gestão administrativa da plataforma Smart Tennis Arena"
      >
        <div className="flex flex-col items-center gap-4 py-12">
          <p className="text-center text-destructive">
            Não foi possível carregar os dados administrativos.
          </p>
          <Button
            onClick={() => {
              void profilesQuery.refetch();
              void sessionsQuery.refetch();
              void trainingsQuery.refetch();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title="Visão geral"
      subtitle="Gestão administrativa da plataforma Smart Tennis Arena"
      actions={
        <Button asChild variant="outline">
          <Link to="/admin/usuarios">
            Gerenciar usuários
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Usuários cadastrados"
          value={profiles.length}
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
          icon={Percent}
        />

        <StatCard
          label="Treinos recentes"
          value={trainings.length}
          icon={ClipboardList}
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <AccuracyTrendChart
          data={trend}
          title="Precisão global"
          description="Últimas sessões concluídas na arena"
        />

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Treinos recentes
            </CardTitle>
            <CardDescription>
              Últimas alterações na biblioteca
            </CardDescription>
          </CardHeader>

          <CardContent>
            {trainings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum treino cadastrado.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Treino</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">
                      Atualizado
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {trainings.map((training) => (
                    <TableRow key={training.id}>
                      <TableCell className="font-medium">
                        {training.title}

                        <span className="ml-2 text-xs text-muted-foreground">
                          v{training.version || "1.0"}
                        </span>
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={
                            training.status === "publicado"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {TRAINING_STATUS_LABEL[
                            training.status as keyof typeof TRAINING_STATUS_LABEL
                          ] || training.status}
                        </Badge>
                      </TableCell>

                      <TableCell className="text-right text-xs text-muted-foreground">
                        {formatDateTime(training.updated_at)}
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
