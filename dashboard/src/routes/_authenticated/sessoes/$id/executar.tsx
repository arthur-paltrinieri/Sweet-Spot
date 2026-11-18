
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  Flame,
  Radio,
  Target,
  Timer,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { RoleGuard } from "@/components/role-guard";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";

type Session = {
  id: string;
  title: string | null;
  status: string;
  started_at: string | null;
  planned_duration_seconds: number | null;
  target_count: number | null;
  difficulty: number | null;
};

type SessionHit = {
  id: string;
  target_index: number;
  hit: boolean | number;
  accuracy: number | string | null;
  reaction_ms: number | null;
  points: number | string | null;
  created_at: string;
};

type LiveState = {
  active_target_index: number | null;
  connected: boolean;
  updated_at: string | null;
};

export const Route = createFileRoute(
  "/_authenticated/sessoes/$id/executar"
)({
  component: () => (
    <RoleGuard
      allowedRoles={["praticante", "treinador", "admin"]}
    >
      <RunSession />
    </RoleGuard>
  ),
});

function RunSession() {
  const { id } = Route.useParams();
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();

  const [now, setNow] = useState(Date.now());
  const [monitoring, setMonitoring] = useState(true);

  const sessionQuery = useQuery<Session>({
    queryKey: ["session", id],
    queryFn: async () => {
      const { data } = await api.get(
        `/sessoes/${encodeURIComponent(id)}`
      );
      return data.session;
    },
    refetchInterval: 2000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const session = sessionQuery.data;
  const finished = session?.status === "concluida";

  const hitsQuery = useQuery<SessionHit[]>({
    queryKey: ["session-hits", id],
    queryFn: async () => {
      const { data } = await api.get(
        `/sessoes/${encodeURIComponent(id)}/hits`
      );
      return data.hits ?? [];
    },
    enabled: !!session && !sessionQuery.isError,
    refetchInterval: !finished && monitoring ? 1200 : false,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const liveQuery = useQuery<LiveState>({
    queryKey: ["session-live", id],
    queryFn: async () => {
      const { data } = await api.get(
        `/sessions/${encodeURIComponent(id)}/live`
      );
      return data;
    },
    enabled: !!session && !finished && monitoring,
    refetchInterval: 1000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const hits = hitsQuery.data ?? [];

  const stats = useMemo(() => {
    let streak = 0;
    let best = 0;
    let totalHits = 0;
    let points = 0;

    for (const attempt of hits) {
      const hit =
        attempt.hit === true ||
        Number(attempt.hit) === 1;

      points += Number(attempt.points ?? 0);

      if (hit) {
        totalHits += 1;
        streak += 1;
        best = Math.max(best, streak);
      } else {
        streak = 0;
      }
    }

    return {
      total: hits.length,
      hits: totalHits,
      misses: hits.length - totalHits,
      points,
      streak,
      best,
      accuracy:
        hits.length > 0
          ? (totalHits / hits.length) * 100
          : 0,
    };
  }, [hits]);

  const planned = Math.max(
    Number(session?.planned_duration_seconds ?? 300),
    1
  );

  const startedAt = session?.started_at
    ? new Date(session.started_at).getTime()
    : NaN;

  const elapsed = Number.isFinite(startedAt)
    ? Math.max(
        0,
        Math.floor((now - startedAt) / 1000)
      )
    : 0;

  const remaining = Math.max(planned - elapsed, 0);
  const progress = Math.min((elapsed / planned) * 100, 100);

  const liveConnected =
    !liveQuery.isError &&
    liveQuery.data?.connected === true;

  const rawTarget = liveConnected
    ? liveQuery.data?.active_target_index
    : null;

  const activeTarget =
    typeof rawTarget === "number" &&
    Number.isInteger(rawTarget) &&
    rawTarget >= 0 &&
    rawTarget < 31
      ? rawTarget
      : null;

  const finish = useMutation({
    mutationFn: async () => {
      await api.put(
        `/sessions/${encodeURIComponent(id)}/end`
      );
    },
    onSuccess: async () => {
      setMonitoring(false);

      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["session", id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["session-hits", id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["my-sessions"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["dashboard"],
        }),
      ]);

      toast.success("Sessão finalizada com sucesso.");

      await navigate({
        to: "/sessoes/$id/resultado",
        params: { id },
      });
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Erro ao finalizar sessão."
      );
    },
  });

  if (sessionQuery.isLoading) {
    return (
      <AppShell
        title="Execução da sessão"
        subtitle="Carregando arena"
      >
        <p className="py-12 text-center text-muted-foreground">
          Carregando sessão...
        </p>
      </AppShell>
    );
  }

  if (sessionQuery.isError || !session) {
    return (
      <AppShell
        title="Execução da sessão"
        subtitle="Não foi possível carregar a sessão"
      >
        <div className="flex flex-col items-center gap-4 py-12">
          <p className="text-destructive">
            Não foi possível consultar esta sessão.
          </p>

          <Button
            variant="outline"
            onClick={() => void sessionQuery.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={session.title ?? "Execução da sessão"}
      subtitle="Acompanhamento da arena física Sweet Spot"
      actions={
        <div className="flex flex-wrap gap-2">
          {!finished && (
            <Button
              variant="outline"
              onClick={() =>
                setMonitoring((current) => !current)
              }
            >
              {monitoring
                ? "Pausar acompanhamento"
                : "Retomar acompanhamento"}
            </Button>
          )}

          {finished && (
            <Button asChild>
              <Link
                to="/sessoes/$id/resultado"
                params={{ id }}
              >
                Ver resultado
              </Link>
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Pontos"
            value={stats.points}
            icon={Trophy}
            accent
          />

          <StatCard
            label="Precisão"
            value={`${stats.accuracy.toFixed(1)}%`}
            icon={Target}
          />

          <StatCard
            label="Combo atual"
            value={`x${stats.streak}`}
            icon={Flame}
            hint={`Melhor: x${stats.best}`}
          />

          <StatCard
            label="Tempo restante"
            value={`${Math.floor(remaining / 60)}:${String(
              remaining % 60
            ).padStart(2, "0")}`}
            icon={Timer}
          />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  Arena · Matriz de LEDs
                </CardTitle>

                <CardDescription>
                  Monitoramento dos alvos físicos de 1 a 31
                </CardDescription>
              </div>

              <div
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
                  liveConnected
                    ? "border-green-500/30 text-green-600"
                    : "border-border text-muted-foreground"
                )}
              >
                <Radio className="h-4 w-4" />

                {finished
                  ? "Sessão concluída"
                  : !monitoring
                    ? "Acompanhamento pausado"
                    : liveConnected
                      ? "Arena conectada"
                      : "Aguardando conexão com a arena"}
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="mx-auto grid max-w-xl grid-cols-10 gap-2">
              {Array.from({ length: 100 }, (_, index) => {
                const enabled = index < 31;
                const isActive =
                  enabled && activeTarget === index;

                return (
                  <div
                    key={index}
                    className={cn(
                      "flex aspect-square items-center justify-center rounded-md border text-[10px] font-medium transition-colors sm:text-xs",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground shadow-md"
                        : enabled
                          ? "border-border bg-card text-muted-foreground"
                          : "border-border/40 bg-muted/30 text-muted-foreground/30"
                    )}
                  >
                    {index + 1}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  Alvo ativo
                </p>

                <p className="text-xs text-muted-foreground">
                  Informado pela integração com o Arduino
                </p>
              </div>

              <div className="text-2xl font-bold text-primary">
                {activeTarget !== null
                  ? `LED ${activeTarget + 1}`
                  : "—"}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Progresso da sessão</span>
                <span>
                  {Math.min(elapsed, planned)}s / {planned}s
                </span>
              </div>

              <Progress value={progress} />
            </div>

            {remaining === 0 && !finished && (
              <p className="text-sm text-amber-600">
                Tempo planejado atingido. Finalize a sessão
                para consolidar os resultados.
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <Button
                disabled={
                  finished ||
                  finish.isPending ||
                  hitsQuery.isLoading ||
                  hitsQuery.isError
                }
                onClick={() => finish.mutate()}
              >
                {finish.isPending
                  ? "Finalizando..."
                  : "Finalizar sessão"}
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  void hitsQuery.refetch();
                  void sessionQuery.refetch();

                  if (monitoring && !finished) {
                    void liveQuery.refetch();
                  }
                }}
              >
                Atualizar dados
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Rebatidas registradas
            </CardTitle>

            <CardDescription>
              {stats.hits} acertos e {stats.misses} erros em{" "}
              {stats.total} tentativas
            </CardDescription>
          </CardHeader>

          <CardContent>
            {hitsQuery.isError ? (
              <div className="space-y-3">
                <p className="text-sm text-destructive">
                  Não foi possível consultar as rebatidas.
                </p>

                <Button
                  variant="outline"
                  onClick={() => void hitsQuery.refetch()}
                >
                  Tentar novamente
                </Button>
              </div>
            ) : hitsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">
                Carregando rebatidas...
              </p>
            ) : hits.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma rebatida registrada ainda.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {hits.slice(-24).map((attempt, index) => {
                  const hit =
                    attempt.hit === true ||
                    Number(attempt.hit) === 1;

                  return (
                    <span
                      key={attempt.id ?? index}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-medium",
                        hit
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border text-muted-foreground"
                      )}
                    >
                      Alvo {Number(attempt.target_index) + 1}
                      {" · "}
                      {hit
                        ? `${Number(attempt.points ?? 0)} pts`
                        : "Erro"}
                    </span>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
