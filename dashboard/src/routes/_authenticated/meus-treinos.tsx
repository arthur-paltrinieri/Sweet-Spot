
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCurrentUser } from "@/hooks/use-auth";
import { api } from "@/services/api";
import { LEVEL_LABEL, formatDate } from "@/lib/domain";

type AssignedTraining = {
  id: string | number;
  title: string | null;
  description: string | null;
  level: string | null;
};

type Assignment = {
  id: string | number;
  training_id: string | number | null;
  due_date: string | null;
  note: string | null;
  completed: boolean | number;
  trainings: AssignedTraining | null;
};

export const Route = createFileRoute(
  "/_authenticated/meus-treinos"
)({
  component: () => (
    <RoleGuard allowedRoles={["praticante", "treinador", "admin"]}>
      <MyTrainings />
    </RoleGuard>
  ),
});

function MyTrainings() {
  const {
    data: me,
    isLoading: isLoadingUser,
  } = useCurrentUser();

  const {
    data: assignments = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Assignment[]>({
    queryKey: ["my-assignments", me?.userId],
    enabled: !!me?.userId,
    queryFn: async () => {
      const { data } = await api.get(
        "/minhas-atribuicoes"
      );

      return data.assignments ?? [];
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    retry: 1,
  });

  return (
    <AppShell
      title="Treinos recebidos"
      subtitle="Treinamentos enviados pelo seu professor"
    >
      {isLoadingUser || isLoading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Carregando treinos recebidos...
        </p>
      ) : isError ? (
        <div className="flex flex-col items-center gap-4 py-12">
          <p className="text-center text-sm text-destructive">
            Não foi possível carregar os treinos recebidos.
          </p>

          <Button
            variant="outline"
            onClick={() => void refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : assignments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          Nenhum treino recebido até o momento.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {assignments.map((assignment) => {
            const training = assignment.trainings;

            const trainingId =
              training?.id ??
              assignment.training_id;

            const completed =
              assignment.completed === true ||
              Number(assignment.completed) === 1;

            const levelLabel = training?.level
              ? LEVEL_LABEL[
                  training.level as keyof typeof LEVEL_LABEL
                ] || training.level
              : "—";

            return (
              <Card key={assignment.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">
                      {training?.title || "Treino"}
                    </CardTitle>

                    <Badge
                      variant={
                        completed
                          ? "secondary"
                          : "default"
                      }
                    >
                      {completed
                        ? "Concluído"
                        : "Pendente"}
                    </Badge>
                  </div>

                  <CardDescription>
                    Prazo:{" "}
                    {assignment.due_date
                      ? formatDate(assignment.due_date)
                      : "Sem prazo"}
                    {" · "}
                    {levelLabel}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-3">
                  {training?.description ? (
                    <p className="text-sm text-muted-foreground">
                      {training.description}
                    </p>
                  ) : null}

                  {assignment.note ? (
                    <p className="rounded-lg bg-accent/50 p-3 text-sm">
                      {assignment.note}
                    </p>
                  ) : null}

                  <div className="flex gap-2">
                    {trainingId != null ? (
                      <Button asChild size="sm">
                        <Link
                          to="/sessoes/nova"
                          search={{
                            training: String(trainingId),
                          }}
                        >
                          {completed
                            ? "Treinar novamente"
                            : "Treinar agora"}
                        </Link>
                      </Button>
                    ) : (
                      <Button size="sm" disabled>
                        Treino indisponível
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
