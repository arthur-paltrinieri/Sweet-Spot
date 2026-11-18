
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import {
  TrainingForm,
  type TrainingFormValue,
} from "@/components/training-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/services/api";

type CreateTrainingResponse = {
  id?: string | number;
  trainingId?: string | number;
  training?: {
    id?: string | number;
  };
};

export const Route = createFileRoute(
  "/_authenticated/treinos/novo"
)({
  component: () => (
    <RoleGuard allowedRoles={["treinador", "admin"]}>
      <NewTraining />
    </RoleGuard>
  ),
});

function NewTraining() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [value, setValue] = useState<TrainingFormValue>({
    title: "",
    description: "",
    level: "iniciante",
    difficulty: 2,
    targetCount: 6,
    durationMinutes: 20,
  });

  const create = useMutation({
    mutationFn: async (): Promise<string | null> => {
      const title = value.title.trim();

      if (!title) {
        throw new Error("Informe o título do treino.");
      }

      const difficulty = Number(value.difficulty);
      const targetCount = Number(value.targetCount);
      const durationMinutes = Number(value.durationMinutes);

      if (
        !Number.isInteger(difficulty) ||
        difficulty < 1 ||
        difficulty > 5
      ) {
        throw new Error("Selecione uma dificuldade válida.");
      }

      if (
        !Number.isInteger(targetCount) ||
        targetCount < 1 ||
        targetCount > 31
      ) {
        throw new Error(
          "A quantidade de alvos deve estar entre 1 e 31."
        );
      }

      if (
        !Number.isInteger(durationMinutes) ||
        durationMinutes < 1 ||
        durationMinutes > 30
      ) {
        throw new Error(
          "A duração deve estar entre 1 e 30 minutos."
        );
      }

      const { data } = await api.post<CreateTrainingResponse>(
        "/trainings",
        {
          title,
          description: value.description.trim(),
          level: value.level,
          difficulty,
          target_count: targetCount,
          duration_minutes: durationMinutes,
          status: "rascunho",
        }
      );

      const trainingId =
        data?.id ??
        data?.trainingId ??
        data?.training?.id;

      return trainingId != null
        ? String(trainingId)
        : null;
    },

    onSuccess: async (trainingId) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["trainings"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["admin-trainings"],
        }),
      ]);

      toast.success("Treino criado como rascunho.");

      if (trainingId) {
        await navigate({
          to: "/treinos/$id",
          params: { id: trainingId },
        });
      } else {
        await navigate({
          to: "/treinos",
        });
      }
    },

    onError: (error: any) => {
      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Erro ao criar o treino."
      );
    },
  });

  return (
    <AppShell
      title="Novo treino"
      subtitle="Crie um treino em rascunho e publique quando estiver pronto"
    >
      <Card className="max-w-3xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Dados do treino
          </CardTitle>

          <CardDescription>
            O treino nasce na versão 1 com status rascunho
          </CardDescription>
        </CardHeader>

        <CardContent>
          <TrainingForm
            value={value}
            onChange={setValue}
            onSubmit={() => create.mutate()}
            submitting={create.isPending}
            submitLabel="Criar treino"
          />
        </CardContent>
      </Card>
    </AppShell>
  );
}
