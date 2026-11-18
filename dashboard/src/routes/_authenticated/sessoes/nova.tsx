
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentUser } from "@/hooks/use-auth";
import { api } from "@/services/api";
import { fetchTrainings } from "@/lib/queries";
import { LEVEL_LABEL } from "@/lib/domain";

type Training = {
  id: string;
  title: string;
  level: string;
  status: string;
};

type CreateSessionResponse = {
  sessionId: string;
  message?: string;
};

const MAX_TARGETS = 31;

export const Route = createFileRoute(
  "/_authenticated/sessoes/nova"
)({
  validateSearch: (
    search: Record<string, unknown>
  ): { training?: string } => {
    const value = search["training"];

    return typeof value === "string"
      ? { training: value }
      : {};
  },

  component: () => (
    <RoleGuard
      allowedRoles={["praticante", "treinador", "admin"]}
    >
      <NewSession />
    </RoleGuard>
  ),
});

function NewSession() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { training } = Route.useSearch();

  const {
    data: me,
    isLoading: isLoadingUser,
  } = useCurrentUser();

  const [title, setTitle] = useState("Sessão de treino");
  const [difficulty, setDifficulty] = useState(2);
  const [targetCount, setTargetCount] = useState(MAX_TARGETS);
  const [minutes, setMinutes] = useState(5);
  const [trainingId, setTrainingId] = useState(
    training ?? ""
  );

  const {
    data: trainings = [],
    isLoading: isLoadingTrainings,
    isError: isTrainingsError,
    refetch: refetchTrainings,
  } = useQuery<Training[]>({
    queryKey: ["trainings"],
    queryFn: fetchTrainings,
  });

  const publishedTrainings = trainings.filter(
    (item) => item.status === "publicado"
  );

  const create = useMutation({
    mutationFn: async (): Promise<string> => {
      const cleanTitle = title.trim();

      if (!cleanTitle) {
        throw new Error(
          "Informe um título para a sessão."
        );
      }

      const { data } =
        await api.post<CreateSessionResponse>(
          "/sessions",
          {
            title: cleanTitle,
            difficulty,
            target_count: targetCount,
            planned_duration_seconds: minutes * 60,
            training_id: trainingId || null,
          }
        );

      if (!data.sessionId) {
        throw new Error(
          "O servidor não retornou o identificador da sessão."
        );
      }

      return String(data.sessionId);
    },

    onSuccess: async (sessionId) => {
      await queryClient.invalidateQueries({
        queryKey: ["my-sessions"],
      });

      toast.success("Sessão criada com sucesso.");

      await navigate({
        to: "/sessoes/$id/executar",
        params: { id: sessionId },
      });
    },

    onError: (error: any) => {
      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Erro ao configurar a sessão."
      );
    },
  });

  const canCreate =
    !create.isPending &&
    !isLoadingUser &&
    !!me?.userId &&
    title.trim().length > 0;

  return (
    <AppShell
      title="Configurar sessão"
      subtitle="Defina os parâmetros da arena antes de iniciar"
    >
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Parâmetros da sessão
            </CardTitle>

            <CardDescription>
              Ajuste dificuldade, alvos e duração
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">
                Título
              </Label>

              <Input
                id="title"
                value={title}
                maxLength={120}
                disabled={create.isPending}
                onChange={(event) =>
                  setTitle(event.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label>
                Treino base (opcional)
              </Label>

              <Select
                value={trainingId || "livre"}
                disabled={
                  create.isPending ||
                  isLoadingTrainings ||
                  isTrainingsError
                }
                onValueChange={(value) =>
                  setTrainingId(
                    value === "livre" ? "" : value
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um treino" />
                </SelectTrigger>

                <SelectContent>
                  <SelectItem value="livre">
                    Sessão livre
                  </SelectItem>

                  {publishedTrainings.map((item) => (
                    <SelectItem
                      key={item.id}
                      value={String(item.id)}
                    >
                      {item.title}
                      {" · "}
                      {LEVEL_LABEL[
                        item.level as keyof typeof LEVEL_LABEL
                      ] || item.level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {isTrainingsError && (
                <div className="flex items-center gap-3">
                  <p className="text-xs text-destructive">
                    Não foi possível carregar os treinos.
                  </p>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void refetchTrainings()
                    }
                  >
                    Tentar novamente
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <Label>
                Dificuldade: nível {difficulty}
              </Label>

              <Slider
                min={1}
                max={5}
                step={1}
                value={[difficulty]}
                disabled={create.isPending}
                onValueChange={(value) =>
                  setDifficulty(value[0] ?? 1)
                }
              />
            </div>

            <div className="space-y-3">
              <Label>
                LEDs disponíveis para sorteio:{" "}
                {targetCount}
              </Label>

              <Slider
                min={1}
                max={MAX_TARGETS}
                step={1}
                value={[targetCount]}
                disabled={create.isPending}
                onValueChange={(value) =>
                  setTargetCount(value[0] ?? 1)
                }
              />

              <p className="text-xs text-muted-foreground">
                O protótipo possui 31 LEDs
                operacionais. Apenas um alvo
                ficará aceso por vez.
              </p>
            </div>

            <div className="space-y-3">
              <Label>
                Duração planejada: {minutes} min
              </Label>

              <Slider
                min={1}
                max={30}
                step={1}
                value={[minutes]}
                disabled={create.isPending}
                onValueChange={(value) =>
                  setMinutes(value[0] ?? 1)
                }
              />
            </div>

            <Button
              className="w-full"
              disabled={!canCreate}
              onClick={() => create.mutate()}
            >
              {create.isPending
                ? "Criando sessão..."
                : "Iniciar sessão"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Prévia da arena
            </CardTitle>

            <CardDescription>
              Representação dos LEDs disponíveis
              no protótipo
            </CardDescription>
          </CardHeader>

          <CardContent>
            <div className="grid grid-cols-10 gap-1.5">
              {Array.from(
                { length: 100 },
                (_, index) => {
                  const enabled =
                    index < targetCount;

                  const operational =
                    index < MAX_TARGETS;

                  return (
                    <div
                      key={index}
                      className={[
                        "flex aspect-square items-center justify-center rounded-md border text-[9px] font-medium sm:text-xs",
                        enabled
                          ? "border-primary/40 bg-primary/15 text-primary"
                          : operational
                            ? "border-border bg-muted/40 text-muted-foreground"
                            : "border-border/30 bg-muted/20 text-muted-foreground/30",
                      ].join(" ")}
                    >
                      {index + 1}
                    </div>
                  );
                }
              )}
            </div>

            <div className="mt-5 space-y-2">
              <p className="text-sm font-medium">
                Configuração selecionada
              </p>

              <div className="space-y-1 text-sm text-muted-foreground">
                <p>
                  Alvos disponíveis: {targetCount}
                </p>

                <p>
                  Dificuldade: nível {difficulty}
                </p>

                <p>
                  Duração: {minutes} minuto(s)
                </p>
              </div>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              Durante o treinamento, o Arduino
              controla os LEDs físicos e a visão
              computacional identifica as
              rebatidas. Os resultados serão
              registrados na sessão e exibidos
              no painel do jogador.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
