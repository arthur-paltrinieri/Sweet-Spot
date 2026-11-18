
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Play, Target } from "lucide-react";
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
import { fetchMySessions } from "@/lib/queries";
import {
  SESSION_STATUS_LABEL,
  formatDateTime,
} from "@/lib/domain";

type Session = {
  id: string;
  title: string | null;
  status: string;
  created_at: string;
  target_count: number | null;
  difficulty: number | null;
};

export const Route = createFileRoute("/_authenticated/sessoes/")({
  component: () => (
    <RoleGuard allowedRoles={["praticante", "treinador", "admin"]}>
      <SessionsHub />
    </RoleGuard>
  ),
});

function SessionsHub() {
  const {
    data: me,
    isLoading: isLoadingUser,
  } = useCurrentUser();

  const {
    data: sessions = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<Session[]>({
    queryKey: ["my-sessions", me?.userId],
    enabled: !!me?.userId,
    queryFn: () => fetchMySessions(me?.userId),
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const open = sessions
    .filter(
      (session) =>
        session.status === "configurada" ||
        session.status === "em_andamento"
    )
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    );

  return (
    <AppShell
      title="Sessões na arena"
      subtitle="Configure e acompanhe treinos na maquete com alvos de LED"
      actions={
        <Button asChild>
          <Link to="/sessoes/nova">
            Configurar nova sessão
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="border-primary/30 bg-accent/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              1. Configurar
            </CardTitle>
            <CardDescription>
              Dificuldade, alvos, duração e treino base
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Button asChild size="sm">
              <Link to="/sessoes/nova">
                <Target className="mr-2 h-4 w-4" />
                Começar
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              2. Executar
            </CardTitle>
            <CardDescription>
              Acompanhamento dos alvos físicos e da pontuação
            </CardDescription>
          </CardHeader>

          <CardContent className="text-sm text-muted-foreground">
            As rebatidas identificadas pela visão computacional
            são registradas no sistema durante o treino.
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              3. Resultado
            </CardTitle>
            <CardDescription>
              Resumo gamificado com pontos, precisão e mapa de alvos
            </CardDescription>
          </CardHeader>

          <CardContent className="text-sm text-muted-foreground">
            Consulte os resultados das sessões concluídas
            no seu painel e no histórico.
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Sessões em aberto
          </CardTitle>

          <CardDescription>
            Retome uma sessão configurada ou em andamento
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-2">
          {isLoadingUser || isLoading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Carregando sessões...
            </p>
          ) : isError ? (
            <div className="flex flex-col items-center gap-4 py-6">
              <p className="text-center text-sm text-destructive">
                Não foi possível carregar as sessões.
              </p>

              <Button
                variant="outline"
                onClick={() => void refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : open.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhuma sessão em aberto. Configure uma nova
              para treinar.
            </p>
          ) : (
            open.map((session) => (
              <div
                key={session.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {session.title || "Sessão de treino"}
                  </p>

                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(session.created_at)}
                    {" · "}
                    {session.target_count ?? 0} alvos
                    {" · "}
                    Dificuldade {session.difficulty ?? 2}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {SESSION_STATUS_LABEL[
                      session.status as keyof typeof SESSION_STATUS_LABEL
                    ] || session.status}
                  </Badge>

                  <Button asChild size="sm">
                    <Link
                      to="/sessoes/$id/executar"
                      params={{ id: session.id }}
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Executar
                    </Link>
                  </Button>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
