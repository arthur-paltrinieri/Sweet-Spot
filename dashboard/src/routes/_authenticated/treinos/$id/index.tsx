
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
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
import { api } from "@/services/api";
import {
  LEVEL_LABEL,
  TRAINING_STATUS_LABEL,
  formatDateTime,
  type TrainingStatus,
} from "@/lib/domain";

type Training = {
  id: string;
  title: string;
  description: string | null;
  level: string;
  status: TrainingStatus;
  version: string | number | null;
  target_count: number | null;
  difficulty: number | null;
  duration_minutes: number | null;
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
};

export const Route = createFileRoute(
  "/_authenticated/treinos/$id/"
)({
  component: () => (
    <RoleGuard allowedRoles={["treinador", "admin"]}>
      <TrainingDetail />
    </RoleGuard>
  ),
});

function TrainingDetail() {
  const { id } = Route.useParams();
  const queryClient = useQueryClient();
  const trainingId = encodeURIComponent(id);

  const {
    data: training,
    isLoading,
    isError,
    refetch,
  } = useQuery<Training | null>({
    queryKey: ["training", id],
    queryFn: async () => {
      const { data } = await api.get(
        `/trainings/${trainingId}`
      );

      return data.training ?? null;
    },
    retry: 1,
    refetchOnWindowFocus: true,
  });

  const changeStatus = useMutation({
    mutationFn: async (status: TrainingStatus) => {
      if (!training) {
        throw new Error("Treino não encontrado.");
      }

      if (training.status === status) {
        throw new Error(
          "O treino já está nesse status."
        );
      }

      await api.put(`/trainings/${trainingId}`, {
        status,
      });
    },

    onSuccess: async () => {
      toast.success("Status do treino atualizado.");

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["training", id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["trainings"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-trainings"],
        }),
      ]);
    },

    onError: (error: any) => {
      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Erro ao atualizar o status do treino."
      );
    },
  });

  const actions = (
    <div className="flex flex-wrap gap-2">
      {training && (
        <>
          <Button asChild variant="outline">
            <Link
              to="/treinos/$id/editar"
              params={{ id }}
            >
              Editar
            </Link>
          </Button>

          <Button asChild variant="ghost">
            <Link
              to="/treinos/$id/analise"
              params={{ id }}
            >
              Análise
            </Link>
          </Button>
        </>
      )}

      <Button asChild variant="outline">
        <Link to="/treinos">
          Voltar
        </Link>
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <AppShell
        title="Detalhes do treino"
        subtitle="Carregando informações"
        actions={actions}
      >
        <div className="py-12 text-center text-muted-foreground">
          Carregando treino...
        </div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell
        title="Detalhes do treino"
        subtitle="Falha ao carregar informações"
        actions={actions}
      >
        <div className="flex flex-col items-center gap-4 py-12">
          <p className="text-center text-destructive">
            Não foi possível carregar o treino.
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

  if (!training) {
    return (
      <AppShell
        title="Treino não encontrado"
        subtitle="Detalhes do treinamento"
        actions={actions}
      >
        <p className="py-12 text-center text-muted-foreground">
          O treino solicitado não foi encontrado.
        </p>
      </AppShell>
    );
  }

  const statusLabel =
    TRAINING_STATUS_LABEL[
      training.status as keyof typeof TRAINING_STATUS_LABEL
    ] || training.status;

  const levelLabel =
    LEVEL_LABEL[
      training.level as keyof typeof LEVEL_LABEL
    ] || training.level;

  return (
    <AppShell
      title={training.title}
      subtitle={`Versão ${training.version || "1.0"} · ${levelLabel}`}
      actions={actions}
    >
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">
                Descrição
              </CardTitle>

              <Badge
                variant={
                  training.status === "publicado"
                    ? "default"
                    : "secondary"
                }
              >
                {statusLabel}
              </Badge>
            </div>

            <CardDescription>
              Conteúdo aplicado na arena com alvos de LED
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4 text-sm">
            <p className="whitespace-pre-line text-muted-foreground">
              {training.description || "Sem descrição."}
            </p>

            <div className="grid gap-3 sm:grid-cols-3">
              <Info
                label="Alvos"
                value={
                  training.target_count !== null
                    ? String(training.target_count)
                    : "—"
                }
              />

              <Info
                label="Dificuldade"
                value={
                  training.difficulty !== null
                    ? String(training.difficulty)
                    : "—"
                }
              />

              <Info
                label="Duração"
                value={
                  training.duration_minutes !== null
                    ? `${training.duration_minutes} min`
                    : "—"
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Versionamento
            </CardTitle>

            <CardDescription>
              Fluxo rascunho → revisão → publicado
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Criado em{" "}
                {training.created_at
                  ? formatDateTime(training.created_at)
                  : "—"}
              </p>

              <p>
                Atualizado em{" "}
                {training.updated_at
                  ? formatDateTime(training.updated_at)
                  : "—"}
              </p>

              <p>
                Publicado em{" "}
                {training.published_at
                  ? formatDateTime(training.published_at)
                  : "Ainda não publicado"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={
                  changeStatus.isPending ||
                  training.status === "rascunho"
                }
                onClick={() =>
                  changeStatus.mutate("rascunho")
                }
              >
                Voltar a rascunho
              </Button>

              <Button
                size="sm"
                variant="outline"
                disabled={
                  changeStatus.isPending ||
                  training.status === "revisao"
                }
                onClick={() =>
                  changeStatus.mutate("revisao")
                }
              >
                Enviar para revisão
              </Button>

              <Button
                size="sm"
                disabled={
                  changeStatus.isPending ||
                  training.status === "publicado"
                }
                onClick={() =>
                  changeStatus.mutate("publicado")
                }
              >
                {changeStatus.isPending &&
                changeStatus.variables === "publicado"
                  ? "Publicando..."
                  : "Publicar nova versão"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-border px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>

      <p className="stat-number mt-1 text-xl font-semibold">
        {value}
      </p>
    </div>
  );
}
