
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentUser } from "@/hooks/use-auth";
import { fetchStudents } from "@/lib/queries";
import { LEVEL_LABEL } from "@/lib/domain";

type Student = {
  id: string;
  full_name: string | null;
  email: string | null;
  tennis_level: string | null;
  institution: string | null;
};

export const Route = createFileRoute(
  "/_authenticated/treinador/alunos/"
)({
  component: () => (
    <RoleGuard allowedRoles={["treinador", "admin"]}>
      <CoachStudents />
    </RoleGuard>
  ),
});

function CoachStudents() {
  const {
    data: me,
    isLoading: isLoadingUser,
  } = useCurrentUser();

  const [term, setTerm] = useState("");

  const {
    data: students = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Student[]>({
    queryKey: ["coach-students", me?.userId],
    enabled: !!me?.userId,
    queryFn: () => fetchStudents(me?.userId),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const filtered = useMemo(() => {
    const search = term.trim().toLowerCase();

    if (!search) {
      return students;
    }

    return students.filter((student) => {
      const name = (student.full_name ?? "").toLowerCase();
      const email = (student.email ?? "").toLowerCase();

      return (
        name.includes(search) ||
        email.includes(search)
      );
    });
  }, [students, term]);

  return (
    <AppShell
      title="Alunos"
      subtitle="Praticantes vinculados ao seu perfil de professor"
      actions={
        <Button asChild>
          <Link to="/treinador/enviar-treino">
            Enviar treino
          </Link>
        </Button>
      }
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Lista de alunos
          </CardTitle>

          <CardDescription>
            {students.length} praticantes vinculados
          </CardDescription>

          <Input
            className="mt-3 max-w-sm"
            placeholder="Buscar por nome ou e-mail..."
            value={term}
            onChange={(event) =>
              setTerm(event.target.value)
            }
          />
        </CardHeader>

        <CardContent>
          {isLoadingUser || isLoading ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Carregando alunos...
            </p>
          ) : isError ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <p className="text-center text-sm text-destructive">
                Não foi possível carregar os alunos.
              </p>

              <Button
                variant="outline"
                onClick={() => void refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              {term.trim()
                ? "Nenhum aluno corresponde à pesquisa."
                : "Nenhum aluno vinculado ao treinador."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Nível</TableHead>
                  <TableHead>Instituição</TableHead>
                  <TableHead className="text-right">
                    Detalhe
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((student) => (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">
                      {student.full_name || "Sem nome"}
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {student.email || "—"}
                    </TableCell>

                    <TableCell>
                      {student.tennis_level ? (
                        <Badge variant="secondary">
                          {LEVEL_LABEL[
                            student.tennis_level as keyof typeof LEVEL_LABEL
                          ] || student.tennis_level}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>

                    <TableCell className="text-muted-foreground">
                      {student.institution || "—"}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                      >
                        <Link
                          to="/treinador/alunos/$id"
                          params={{ id: student.id }}
                        >
                          Ver desempenho
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
