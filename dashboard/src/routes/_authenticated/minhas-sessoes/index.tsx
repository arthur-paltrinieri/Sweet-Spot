
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCurrentUser } from "@/hooks/use-auth";
import { fetchMySessions } from "@/lib/queries";
import {
  SESSION_STATUS_LABEL,
  formatDateTime,
} from "@/lib/domain";

type Session = {
  id: string;
  title: string | null;
  created_at: string;
  status: string;
  accuracy: number | string | null;
  total_points: number | null;
  best_streak: number | null;
};

export const Route = createFileRoute(
  "/_authenticated/minhas-sessoes/"
)({
  component: () => (
    <RoleGuard allowedRoles={["praticante", "treinador", "admin"]}>
      <MySessions />
    </RoleGuard>
  ),
});

function MySessions() {
  const { data: me, isLoading: isLoadingUser } = useCurrentUser();

  const {
    data: sessions = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Session[]>({
    queryKey: ["my-sessions", me?.userId],
    enabled: !!me?.userId,
    queryFn: async () => {
      return fetchMySessions(me?.userId);
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  return (
    <AppShell
      title="Histórico de sessões"
      subtitle="Todas as suas sessões de treino na arena"
      actions={
        <Button asChild>
          <Link to="/sessoes/nova">
            Configurar sessão
          </Link>
        </Button>
      }
    >
      <Card>
        <CardContent className="p-0">
          {isLoadingUser || isLoading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Carregando histórico de sessões...
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center gap-4 py-12">
              <p className="text-sm text-destructive">
                Não foi possível carregar o histórico de sessões.
              </p>

              <Button
                variant="outline"
                onClick={() => void refetch()}
              >
                Tentar novamente
              </Button>
            </div>
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
                  <TableHead className="text-right">
                    Sequência
                  </TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>

              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">
                      {session.title || "Sessão de treino"}
                    </TableCell>

                    <TableCell>
                      {formatDateTime(session.created_at)}
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={
                          session.status === "concluida"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {SESSION_STATUS_LABEL[
                          session.status as keyof typeof SESSION_STATUS_LABEL
                        ] || session.status}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-right">
                      {session.accuracy !== null
                        ? `${Number(session.accuracy).toFixed(1)}%`
                        : "—"}
                    </TableCell>

                    <TableCell className="text-right">
                      {session.total_points ?? "—"}
                    </TableCell>

                    <TableCell className="text-right">
                      {session.best_streak !== null
                        ? `x${session.best_streak}`
                        : "—"}
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        asChild
                        variant="ghost"
                        size="sm"
                      >
                        <Link
                          to="/minhas-sessoes/$id"
                          params={{ id: session.id }}
                        >
                          Detalhes
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {sessions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="py-10 text-center text-muted-foreground"
                    >
                      Nenhuma sessão registrada ainda.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
