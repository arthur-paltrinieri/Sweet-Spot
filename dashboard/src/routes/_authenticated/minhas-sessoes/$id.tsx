
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Award, Flame, Target, Trophy } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { StatCard } from "@/components/stat-card";
import { TargetsBarChart } from "@/components/charts";
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
import { formatDateTime } from "@/lib/domain";

type Session = {
  id: string;
  title: string;
  created_at: string;
  status: string;
  total_points: number | null;
  accuracy: number | null;
  best_streak: number | null;
  bonus_points: number | null;
};

type SessionHit = {
  id: string;
  target_index: number;
  hit: boolean | number;
  accuracy: number | null;
  reaction_ms: number | null;
  points: number | null;
};

type SessionData = {
  session: Session | null;
  hits: SessionHit[];
};

export const Route = createFileRoute(
  "/_authenticated/minhas-sessoes/$id"
)({
  component: () => (
    <RoleGuard
      allowedRoles={["praticante", "treinador", "admin"]}
    >
      <SessionDetail />
    </RoleGuard>
  ),
});

function SessionDetail() {
  const { id } = Route.useParams();

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery<SessionData>({
    queryKey: ["session-detail", id],
    queryFn: async () => {
      const [sessionRes, hitsRes] = await Promise.all([
        api.get(`/sessoes/${encodeURIComponent(id)}`),
        api.get(`/sessoes/${encodeURIComponent(id)}/hits`),
      ]);

      return {
        session: sessionRes.data.session ?? null,
        hits: hitsRes.data.hits ?? [],
      };
    },
  });

  const session = data?.session ?? null;
  const hits = data?.hits ?? [];

  const byTarget = new Map<number, number>();

  hits.forEach((hit) => {
    if (Boolean(hit.hit)) {
      const target = Number(hit.target_index);

      byTarget.set(
        target,
        (byTarget.get(target) ?? 0) + 1
      );
    }
  });

  const targets = [...byTarget.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([index, value]) => ({
      label: `Alvo ${index + 1}`,
      value,
    }));

  const totalHits = hits.filter(
    (hit) => Boolean(hit.hit)
  ).length;

  const totalMisses = hits.length - totalHits;

  const content = () => {
    if (isLoading) {
      return (
        <div className="py-12 text-center text-muted-foreground">
          Carregando resultados da sessão...
        </div>
      );
    }

    if (isError) {
      return (
        <div className="flex flex-col items-center gap-4 py-12">
          <p className="text-destructive">
            Não foi possível carregar os resultados.
          </p>

          <Button
            variant="outline"
            onClick={() => void refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      );
    }

    if (!session) {
      return (
        <div className="py-12 text-center text-muted-foreground">
          Sessão não encontrada.
        </div>
      );
    }

    return (
      <>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Pontos"
            value={session.total_points ?? 0}
            icon={Trophy}
            accent
          />

          <StatCard
            label="Precisão"
            value={`${Number(session.accuracy ?? 0).toFixed(1)}%`}
            icon={Target}
          />

          <StatCard
            label="Melhor sequência"
            value={`x${session.best_streak ?? 0}`}
            icon={Flame}
          />

          <StatCard
            label="Bônus"
            value={session.bonus_points ?? 0}
            icon={Award}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-3 text-sm text-muted-foreground">
          <span>
            Rebatidas: <strong>{hits.length}</strong>
          </span>

          <span>
            Acertos: <strong>{totalHits}</strong>
          </span>

          <span>
            Erros: <strong>{totalMisses}</strong>
          </span>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <TargetsBarChart
            data={targets}
            description="Acertos por alvo nesta sessão"
          />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                Rebatidas registradas
              </CardTitle>

              <CardDescription>
                Resultados da visão computacional e da arena
              </CardDescription>
            </CardHeader>

            <CardContent className="max-h-64 overflow-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Alvo</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead className="text-right">
                      Precisão
                    </TableHead>
                    <TableHead className="text-right">
                      Reação
                    </TableHead>
                    <TableHead className="text-right">
                      Pontos
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {hits.map((hit, index) => (
                    <TableRow key={hit.id ?? index}>
                      <TableCell>
                        Alvo {Number(hit.target_index) + 1}
                      </TableCell>

                      <TableCell
                        className={
                          Boolean(hit.hit)
                            ? "text-success"
                            : "text-muted-foreground"
                        }
                      >
                        {Boolean(hit.hit)
                          ? "Acerto"
                          : "Erro"}
                      </TableCell>

                      <TableCell className="text-right">
                        {hit.accuracy !== null
                          ? `${Number(hit.accuracy).toFixed(0)}%`
                          : "—"}
                      </TableCell>

                      <TableCell className="text-right">
                        {hit.reaction_ms !== null
                          ? `${hit.reaction_ms} ms`
                          : "—"}
                      </TableCell>

                      <TableCell className="text-right">
                        {hit.points ?? 0}
                      </TableCell>
                    </TableRow>
                  ))}

                  {hits.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-8 text-center text-muted-foreground"
                      >
                        Nenhuma rebatida registrada.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </>
    );
  };

  return (
    <AppShell
      title={session?.title ?? "Detalhes da sessão"}
      subtitle={
        session
          ? formatDateTime(session.created_at)
          : "Histórico de treinamento"
      }
      actions={
        <Button asChild variant="outline">
          <Link to="/minhas-sessoes">
            Voltar
          </Link>
        </Button>
      }
    >
      {content()}
    </AppShell>
  );
}
