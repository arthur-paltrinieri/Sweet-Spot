
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import {
  TrainingForm,
  type TrainingFormValue,
} from "@/components/training-form";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/services/api";

type Training = {
  id: string;
  title: string;
  description: string | null;
  level: TrainingFormValue["level"];
  difficulty: number | string | null;
  target_count: number | string | null;
  duration_minutes: number | string | null;
  version: string | number | null;
};

export const Route = createFileRoute(
  "/_authenticated/treinos/$id/editar"
)({
  component: () => (
    <RoleGuard allowedRoles={["treinador", "admin"]}>
      <EditTraining />
    </RoleGuard>
  ),
});

function EditTraining() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
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
  });

  const [value, setValue] = useState<TrainingFormValue>({
    title: "",
    description: "",
    level: "iniciante",
    difficulty: 2,
    targetCount: 6,
    durationMinutes: 20,
  });

  useEffect(() => {
    if (!training) return;

    setValue({
      title: training.title ?? "",
      description: training.description ?? "",
      level: training.level ?? "iniciante",
      difficulty: Number(training.difficulty ?? 2),
      targetCount: Number(training.target_count ?? 6),
      durationMinutes: Number(training.duration_minutes ?? 20),
    });
  }, [training]);

  const save = useMutation({
    mutationFn: async () => {
      const cleanTitle = value.title.trim();

      if (!cleanTitle) {
        throw new Error("Informe o título do treino.");
      }

      await api.put(`/trainings/${trainingId}`, {
        title: cleanTitle,
        description: value.description.trim(),
        level: value.level,
        difficulty: value.difficulty,
        target_count: value.targetCount,
        duration_minutes: value.durationMinutes,
      });
    },

    onSuccess: async () => {
      toast.success("Treino atualizado com sucesso.");

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

      await navigate({
        to: "/treinos/$id",
        params: { id },
      });
    },

    onError: (error: any) => {
      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Erro ao atualizar o treino."
      );
    },
  });

  return (
    <AppShell
      title="Editar treino"
      subtitle="Ajuste o conteúdo e publique uma nova versão em seguida"
    >
      <Card className="max-w-3xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Dados do treino
          </CardTitle>

          <CardDescription>
            {training
              ? `Versão atual ${training.version || "1.0"}`
              : "Edição de treinamento"}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Carregando treino...
            </p>
          ) : isError ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <p className="text-sm text-destructive">
                Não foi possível carregar o treino.
              </p>

              <Button
                variant="outline"
                onClick={() => void refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : !training ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <p className="text-sm text-muted-foreground">
                Treino não encontrado.
              </p>

              <Button asChild variant="outline">
                <Link to="/treinos">
                  Voltar aos treinos
                </Link>
              </Button>
            </div>
          ) : (
            <TrainingForm
              value={value}
              onChange={setValue}
              onSubmit={() => save.mutate()}
              submitting={save.isPending}
              submitLabel="Salvar alterações"
            />
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
