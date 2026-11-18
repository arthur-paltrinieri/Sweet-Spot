
import { createFileRoute } from "@tanstack/react-router";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/services/api";
import {
  LEVEL_LABEL,
  ROLE_LABEL,
  formatDate,
  type AppRole,
} from "@/lib/domain";

type UserProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  tennis_level: string | null;
  institution: string | null;
  created_at: string | null;
  role: AppRole;
};

type UpdateRole = {
  userId: string;
  role: AppRole;
};

export const Route = createFileRoute(
  "/_authenticated/admin/usuarios"
)({
  component: () => (
    <RoleGuard allowedRoles={["admin"]}>
      <AdminUsers />
    </RoleGuard>
  ),
});

function AdminUsers() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const {
    data: profiles = [],
    isLoading,
    isError,
    refetch,
  } = useQuery<UserProfile[]>({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data } = await api.get("/admin/usuarios");
      return data.profiles ?? [];
    },
  });

  const changeRole = useMutation({
    mutationFn: async ({ userId, role }: UpdateRole) => {
      await api.put(
        `/admin/usuarios/${encodeURIComponent(userId)}/role`,
        { role }
      );

      return { userId, role };
    },

    onSuccess: async () => {
      toast.success("Permissão atualizada com sucesso.");

      await queryClient.invalidateQueries({
        queryKey: ["admin-users"],
      });

      await queryClient.invalidateQueries({
        queryKey: ["admin-profiles"],
      });
    },

    onError: (error: any) => {
      toast.error(
        error.response?.data?.error ||
          error.message ||
          "Erro ao atualizar permissão."
      );
    },
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return profiles;
    }

    return profiles.filter((profile) => {
      const name = (profile.full_name ?? "").toLowerCase();
      const email = (profile.email ?? "").toLowerCase();

      return name.includes(term) || email.includes(term);
    });
  }, [profiles, search]);

  return (
    <AppShell
      title="Usuários e permissões"
      subtitle="Controle os perfis de acesso de praticantes, treinadores e administradores"
    >
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Base de usuários
          </CardTitle>

          <CardDescription>
            {profiles.length} cadastro(s) na plataforma
          </CardDescription>

          <div className="pt-3">
            <Input
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Buscar por nome ou e-mail"
              className="max-w-sm"
            />
          </div>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">
              Carregando usuários...
            </p>
          ) : isError ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <p className="text-sm text-destructive">
                Não foi possível carregar os usuários.
              </p>

              <Button
                variant="outline"
                onClick={() => void refetch()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {search.trim()
                ? "Nenhum usuário corresponde à pesquisa."
                : "Nenhum usuário cadastrado."}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Nível</TableHead>
                  <TableHead>Instituição</TableHead>
                  <TableHead>Cadastro</TableHead>
                  <TableHead className="w-56">
                    Perfil de acesso
                  </TableHead>
                </TableRow>
              </TableHeader>

              <TableBody>
                {filtered.map((profile) => {
                  const role = profile.role ?? "praticante";

                  const isSaving =
                    changeRole.isPending &&
                    changeRole.variables?.userId === profile.id;

                  return (
                    <TableRow key={profile.id}>
                      <TableCell>
                        <p className="font-medium">
                          {profile.full_name || "Sem nome"}
                        </p>

                        <p className="text-xs text-muted-foreground">
                          {profile.email || "—"}
                        </p>
                      </TableCell>

                      <TableCell>
                        {profile.tennis_level ? (
                          <Badge variant="secondary">
                            {LEVEL_LABEL[
                              profile.tennis_level as keyof typeof LEVEL_LABEL
                            ] || profile.tennis_level}
                          </Badge>
                        ) : (
                          "—"
                        )}
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">
                        {profile.institution || "—"}
                      </TableCell>

                      <TableCell className="text-sm text-muted-foreground">
                        {profile.created_at
                          ? formatDate(profile.created_at)
                          : "—"}
                      </TableCell>

                      <TableCell>
                        <Select
                          value={role}
                          disabled={changeRole.isPending}
                          onValueChange={(next) => {
                            if (next === role) return;

                            changeRole.mutate({
                              userId: profile.id,
                              role: next as AppRole,
                            });
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>

                          <SelectContent>
                            {(Object.keys(ROLE_LABEL) as AppRole[]).map(
                              (item) => (
                                <SelectItem
                                  key={item}
                                  value={item}
                                >
                                  {ROLE_LABEL[item]}
                                </SelectItem>
                              )
                            )}
                          </SelectContent>
                        </Select>

                        {isSaving ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Salvando permissão...
                          </p>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
