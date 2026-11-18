
import { createFileRoute } from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useState } from "react";
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
import { api } from "@/services/api";
import { formatDateTime } from "@/lib/domain";

type SystemSetting = {
  key: string;
  value: string;
  description?: string | null;
  updated_at?: string | null;
};

export const Route = createFileRoute(
  "/_authenticated/admin/parametros"
)({
  component: () => (
    <RoleGuard allowedRoles={["admin"]}>
      <AdminSettings />
    </RoleGuard>
  ),
});

function AdminSettings() {
  const queryClient = useQueryClient();

  const [values, setValues] = useState<Record<string, string>>({});

  const {
    data: settings = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<SystemSetting[]>({
    queryKey: ["system-settings"],
    queryFn: async () => {
      const { data } = await api.get("/admin/settings");
      return data.settings ?? [];
    },
  });

  useEffect(() => {
    setValues(
      Object.fromEntries(
        settings.map((setting) => [
          setting.key,
          String(setting.value ?? ""),
        ])
      )
    );
  }, [settings]);

  const save = useMutation({
    mutationFn: async (key: string) => {
      const value = values[key] ?? "";

      await api.put(
        `/admin/settings/${encodeURIComponent(key)}`,
        { value }
      );

      return key;
    },
    onSuccess: async () => {
      toast.success("Parâmetro atualizado com sucesso.");

      await queryClient.invalidateQueries({
        queryKey: ["system-settings"],
      });
    },
    onError: (error: any) => {
      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Erro ao salvar parâmetro."
      );
    },
  });

  return (
    <AppShell
      title="Parâmetros do sistema"
      subtitle="Ajustes gerais da arena, gamificação e integração com a maquete"
    >
      <Card className="max-w-3xl">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Configurações
          </CardTitle>
          <CardDescription>
            Alterações valem para toda a plataforma
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Carregando parâmetros...
            </p>
          ) : isError ? (
            <div className="space-y-4">
              <p className="text-sm text-destructive">
                Não foi possível carregar os parâmetros do sistema.
              </p>

              <Button
                variant="outline"
                onClick={() => void refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : settings.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum parâmetro cadastrado.
            </p>
          ) : (
            settings.map((setting) => {
              const currentValue =
                values[setting.key] ?? "";

              const originalValue =
                String(setting.value ?? "");

              const hasChanges =
                currentValue !== originalValue;

              const isSaving =
                save.isPending &&
                save.variables === setting.key;

              return (
                <div
                  key={setting.key}
                  className="space-y-2 border-b border-border pb-5 last:border-0"
                >
                  <Label htmlFor={setting.key}>
                    {setting.key}
                  </Label>

                  {setting.description ? (
                    <p className="text-xs text-muted-foreground">
                      {setting.description}
                    </p>
                  ) : null}

                  <div className="flex flex-wrap gap-2">
                    <Input
                      id={setting.key}
                      className="max-w-xs"
                      value={currentValue}
                      disabled={isSaving}
                      onChange={(event) =>
                        setValues((previous) => ({
                          ...previous,
                          [setting.key]:
                            event.target.value,
                        }))
                      }
                    />

                    <Button
                      variant="outline"
                      disabled={
                        save.isPending || !hasChanges
                      }
                      onClick={() =>
                        save.mutate(setting.key)
                      }
                    >
                      {isSaving
                        ? "Salvando..."
                        : "Salvar"}
                    </Button>
                  </div>

                  {setting.updated_at ? (
                    <p className="text-xs text-muted-foreground">
                      Atualizado em{" "}
                      {formatDateTime(
                        setting.updated_at
                      )}
                    </p>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
