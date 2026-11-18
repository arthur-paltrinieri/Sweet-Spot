
import { createFileRoute } from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCurrentUser } from "@/hooks/use-auth";
import { api } from "@/services/api";
import {
  fetchStudents,
  fetchTrainings,
} from "@/lib/queries";
import {
  LEVEL_LABEL,
  formatDate,
} from "@/lib/domain";

type Student = {
  id: string;
  full_name: string | null;
  tennis_level: string | null;
};

type Training = {
  id: string;
  title: string;
  level: string;
  status: string;
};

type Assignment = {
  id: string;
  created_at: string;
  completed: boolean | number;
  training_title?: string | null;
  student_name?: string | null;
  trainings?: {
    title?: string | null;
  } | null;
};

export const Route = createFileRoute(
  "/_authenticated/treinador/enviar-treino"
)({
  component: () => (
    <RoleGuard allowedRoles={["treinador", "admin"]}>
      <AssignTraining />
    </RoleGuard>
  ),
});

function AssignTraining() {
  const { data: me } = useCurrentUser();
  const queryClient = useQueryClient();

  const [trainingId, setTrainingId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string[]>([]);

  const studentsQuery = useQuery<Student[]>({
    queryKey: ["coach-students", me?.userId],
    enabled: !!me?.userId,
    queryFn: () => fetchStudents(me?.userId),
  });

  const trainingsQuery = useQuery<Training[]>({
    queryKey: ["trainings"],
    queryFn: fetchTrainings,
  });

  const recentQuery = useQuery<Assignment[]>({
    queryKey: ["assignments-sent", me?.userId],
    enabled: !!me?.userId,
    queryFn: async () => {
      const { data } = await api.get(
        "/treinador/atribuicoes/recentes"
      );
      return data.assignments ?? [];
    },
  });

  const students = studentsQuery.data ?? [];
  const trainings = trainingsQuery.data ?? [];
  const recent = recentQuery.data ?? [];

  const published = trainings.filter(
    (training) => training.status === "publicado"
  );

  const send = useMutation({
    mutationFn: async () => {
      if (!trainingId) {
        throw new Error(
          "Selecione um treino publicado."
        );
      }

      if (!published.some(
        (training) => String(training.id) === trainingId
      )) {
        throw new Error(
          "O treino selecionado não está publicado."
        );
      }

      if (selected.length === 0) {
        throw new Error(
          "Selecione ao menos um aluno."
        );
      }

      const studentIds = [...new Set(selected)];

      if (
        studentIds.some(
          (studentId) =>
            !students.some(
              (student) =>
                String(student.id) === studentId
            )
        )
      ) {
        throw new Error(
          "Existe um aluno inválido na seleção."
        );
      }

      const assignments = studentIds.map(
        (studentId) => ({
          training_id: trainingId,
          student_id: studentId,
          due_date: dueDate || null,
          note: note.trim() || null,
        })
      );

      await api.post("/treinador/atribuicoes", {
        assignments,
      });
    },

    onSuccess: async () => {
      toast.success(
        "Treino enviado aos alunos selecionados."
      );

      setSelected([]);
      setNote("");
      setDueDate("");

      await queryClient.invalidateQueries({
        queryKey: ["assignments-sent"],
      });
    },

    onError: (error: any) => {
      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Erro ao enviar o treino."
      );
    },
  });

  const canSend =
    !send.isPending &&
    !studentsQuery.isLoading &&
    !studentsQuery.isError &&
    !trainingsQuery.isLoading &&
    !trainingsQuery.isError &&
    !!me?.userId &&
    !!trainingId &&
    selected.length > 0;

  return (
    <AppShell
      title="Enviar treino"
      subtitle="Atribua um treino publicado aos seus alunos"
    >
      <div className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Configuração do envio
            </CardTitle>

            <CardDescription>
              Escolha o treino, o prazo e uma orientação
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Treino</Label>

              <Select
                value={trainingId}
                disabled={
                  send.isPending ||
                  trainingsQuery.isLoading ||
                  trainingsQuery.isError
                }
                onValueChange={setTrainingId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um treino publicado" />
                </SelectTrigger>

                <SelectContent>
                  {published.map((training) => (
                    <SelectItem
                      key={training.id}
                      value={String(training.id)}
                    >
                      {training.title}
                      {" · "}
                      {LEVEL_LABEL[
                        training.level as keyof typeof LEVEL_LABEL
                      ] || training.level}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {trainingsQuery.isLoading ? (
                <p className="text-xs text-muted-foreground">
                  Carregando treinos...
                </p>
              ) : trainingsQuery.isError ? (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-destructive">
                    Erro ao carregar treinos.
                  </p>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      void trainingsQuery.refetch()
                    }
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : published.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum treino publicado ainda.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="due">
                Prazo
              </Label>

              <Input
                id="due"
                type="date"
                value={dueDate}
                disabled={send.isPending}
                onChange={(event) =>
                  setDueDate(event.target.value)
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="note">
                Orientação
              </Label>

              <Textarea
                id="note"
                rows={4}
                maxLength={1000}
                disabled={send.isPending}
                placeholder="Foque nos alvos laterais e mantenha o ritmo de rebatida."
                value={note}
                onChange={(event) =>
                  setNote(event.target.value)
                }
              />
            </div>

            <Button
              className="w-full"
              disabled={!canSend}
              onClick={() => send.mutate()}
            >
              {send.isPending
                ? "Enviando..."
                : `Enviar para ${selected.length} aluno(s)`}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Alunos
              </CardTitle>

              <CardDescription>
                Selecione quem receberá o treino
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-2">
              {studentsQuery.isLoading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Carregando alunos...
                </p>
              ) : studentsQuery.isError ? (
                <div className="flex flex-col items-center gap-3 py-6">
                  <p className="text-sm text-destructive">
                    Não foi possível carregar os alunos.
                  </p>

                  <Button
                    variant="outline"
                    onClick={() =>
                      void studentsQuery.refetch()
                    }
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : students.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Nenhum aluno vinculado ao seu perfil.
                </p>
              ) : (
                students.map((student) => {
                  const studentId = String(student.id);
                  const checked =
                    selected.includes(studentId);

                  return (
                    <label
                      key={studentId}
                      className="flex cursor-pointer items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm"
                    >
                      <Checkbox
                        checked={checked}
                        disabled={send.isPending}
                        onCheckedChange={(value) =>
                          setSelected((current) =>
                            value === true
                              ? [
                                  ...new Set([
                                    ...current,
                                    studentId,
                                  ]),
                                ]
                              : current.filter(
                                  (item) =>
                                    item !== studentId
                                )
                          )
                        }
                      />

                      <span className="font-medium">
                        {student.full_name || "Sem nome"}
                      </span>

                      {student.tennis_level ? (
                        <Badge
                          variant="secondary"
                          className="ml-auto"
                        >
                          {LEVEL_LABEL[
                            student.tennis_level as keyof typeof LEVEL_LABEL
                          ] || student.tennis_level}
                        </Badge>
                      ) : null}
                    </label>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                Envios recentes
              </CardTitle>

              <CardDescription>
                Últimas atribuições realizadas
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-2">
              {recentQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">
                  Carregando envios...
                </p>
              ) : recentQuery.isError ? (
                <div className="space-y-3">
                  <p className="text-sm text-destructive">
                    Não foi possível carregar os envios.
                  </p>

                  <Button
                    variant="outline"
                    onClick={() =>
                      void recentQuery.refetch()
                    }
                  >
                    Tentar novamente
                  </Button>
                </div>
              ) : recent.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum envio registrado.
                </p>
              ) : (
                recent.map((assignment) => (
                  <div
                    key={assignment.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-2 text-sm"
                  >
                    <div>
                      <p className="font-medium">
                        {assignment.training_title ||
                          assignment.trainings?.title ||
                          "Treino"}
                      </p>

                      {assignment.student_name ? (
                        <p className="text-xs text-muted-foreground">
                          {assignment.student_name}
                        </p>
                      ) : null}
                    </div>

                    <span className="text-right text-muted-foreground">
                      {formatDate(assignment.created_at)}
                      {" · "}
                      {Boolean(assignment.completed)
                        ? "Concluído"
                        : "Pendente"}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
