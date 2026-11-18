
import {
  createFileRoute,
  Link,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Zap } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  HOME_BY_ROLE,
  LEVEL_LABEL,
  type AppRole,
  type TennisLevel,
} from "@/lib/domain";
import { api } from "@/services/api";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      {
        title: "Entrar · Smart Tennis Arena",
      },
      {
        name: "description",
        content: "Acesse a Smart Tennis Arena",
      },
    ],
  }),
  component: AuthPage,
});

const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Informe seu nome")
    .max(120),
  email: z
    .string()
    .trim()
    .email("E-mail inválido")
    .max(255),
  password: z
    .string()
    .min(6, "A senha deve ter ao menos 6 caracteres")
    .max(72),
});

type LoginResponse = {
  token?: string;
  user?: {
    id?: string | number;
    userId?: string | number;
    role?: AppRole;
    email?: string;
    full_name?: string;
  };
};

function getErrorMessage(
  error: unknown,
  fallback: string
): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error
  ) {
    const response = (
      error as {
        response?: {
          data?: {
            error?: string;
          };
        };
      }
    ).response;

    if (response?.data?.error) {
      return response.data.error;
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const [role, setRole] = useState<AppRole>("praticante");
  const [level, setLevel] =
    useState<TennisLevel>("iniciante");
  const [institution, setInstitution] = useState("");

  async function handleSignIn(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const email = String(
      form.get("email") ?? ""
    )
      .trim()
      .toLowerCase();

    const password = String(
      form.get("password") ?? ""
    );

    if (!email || !password) {
      toast.error("Informe seu e-mail e sua senha.");
      return;
    }

    setLoading(true);

    try {
      const { data } = await api.post<LoginResponse>(
        "/login",
        {
          email,
          password,
        }
      );

      if (
        typeof data.token !== "string" ||
        !data.token ||
        !data.user
      ) {
        throw new Error(
          "O servidor não retornou os dados de autenticação."
        );
      }

      const userRole: AppRole =
        data.user.role === "admin" ||
        data.user.role === "treinador"
          ? data.user.role
          : "praticante";

      localStorage.setItem(
        "@SmartTennis:token",
        data.token
      );

      localStorage.setItem(
        "@SmartTennis:user",
        JSON.stringify(data.user)
      );

      queryClient.clear();

      await router.invalidate();

      toast.success("Login realizado com sucesso.");

      await navigate({
        to: HOME_BY_ROLE[userRole],
        replace: true,
      });
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "Erro ao entrar. Verifique suas credenciais."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleSignUp(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const form = new FormData(event.currentTarget);

    const parsed = signUpSchema.safeParse({
      fullName: String(
        form.get("fullName") ?? ""
      ),
      email: String(
        form.get("email") ?? ""
      ),
      password: String(
        form.get("password") ?? ""
      ),
    });

    if (!parsed.success) {
      toast.error(
        parsed.error.issues[0]?.message ??
          "Dados inválidos."
      );
      return;
    }

    if (
      role === "treinador" &&
      institution.trim().length > 120
    ) {
      toast.error(
        "O nome da instituição deve ter no máximo 120 caracteres."
      );
      return;
    }

    setLoading(true);

    try {
      await api.post("/register", {
        name: parsed.data.fullName,
        email: parsed.data.email.toLowerCase(),
        password: parsed.data.password,
        role:
          role === "treinador"
            ? "treinador"
            : "praticante",
        level:
          role === "praticante"
            ? level
            : null,
        institution:
          role === "treinador"
            ? institution.trim() || null
            : null,
      });

      toast.success(
        "Conta criada com sucesso! Faça login para continuar."
      );

      setActiveTab("login");
    } catch (error) {
      toast.error(
        getErrorMessage(
          error,
          "Erro ao criar conta."
        )
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <Link
          to="/"
          className="flex items-center gap-2 font-display text-xl font-semibold uppercase"
        >
          <Zap className="h-6 w-6" />
          Smart Tennis Arena
        </Link>

        <div>
          <h2 className="font-display text-4xl font-semibold uppercase leading-tight">
            Cada rebatida vira pontuação
          </h2>

          <p className="mt-3 max-w-md text-sm opacity-90">
            Alvos de LED, sensores IoT e robótica
            medem a precisão das suas rebatidas
            na maquete e transformam o treino
            em progressão gamificada.
          </p>
        </div>

        <p className="text-xs opacity-75">
          Praticantes · Professores e instituições
          · Administração
        </p>
      </div>

      <div className="flex items-center justify-center bg-background px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-display text-2xl uppercase">
              Acesse a arena
            </CardTitle>

            <CardDescription>
              Entre na sua conta ou crie um novo perfil.
            </CardDescription>
          </CardHeader>

          <CardContent>
            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="mt-2"
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger
                  value="login"
                  disabled={loading}
                >
                  Entrar
                </TabsTrigger>

                <TabsTrigger
                  value="signup"
                  disabled={loading}
                >
                  Cadastrar
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login">
                <form
                  className="space-y-4 pt-4"
                  onSubmit={handleSignIn}
                >
                  <div className="space-y-2">
                    <Label htmlFor="login-email">
                      E-mail
                    </Label>

                    <Input
                      id="login-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={255}
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">
                      Senha
                    </Label>

                    <Input
                      id="login-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      maxLength={72}
                      disabled={loading}
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading}
                  >
                    {loading ? "Entrando..." : "Entrar"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup">
                <form
                  className="space-y-4 pt-4"
                  onSubmit={handleSignUp}
                >
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">
                      Nome completo
                    </Label>

                    <Input
                      id="signup-name"
                      name="fullName"
                      autoComplete="name"
                      required
                      maxLength={120}
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-email">
                      E-mail
                    </Label>

                    <Input
                      id="signup-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      maxLength={255}
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="signup-password">
                      Senha
                    </Label>

                    <Input
                      id="signup-password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      minLength={6}
                      maxLength={72}
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Perfil</Label>

                    <Select
                      value={role}
                      disabled={loading}
                      onValueChange={(value) =>
                        setRole(value as AppRole)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent>
                        <SelectItem value="praticante">
                          Praticante (jogador)
                        </SelectItem>

                        <SelectItem value="treinador">
                          Professor / Instituição
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {role === "praticante" ? (
                    <div className="space-y-2">
                      <Label>Nível de tênis</Label>

                      <Select
                        value={level}
                        disabled={loading}
                        onValueChange={(value) =>
                          setLevel(
                            value as TennisLevel
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>

                        <SelectContent>
                          {Object.entries(
                            LEVEL_LABEL
                          ).map(([value, label]) => (
                            <SelectItem
                              key={value}
                              value={value}
                            >
                              {label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label htmlFor="signup-institution">
                        Instituição
                      </Label>

                      <Input
                        id="signup-institution"
                        value={institution}
                        onChange={(event) =>
                          setInstitution(
                            event.target.value
                          )
                        }
                        maxLength={120}
                        disabled={loading}
                        placeholder="Academia, clube ou escola"
                      />
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loading}
                  >
                    {loading
                      ? "Criando conta..."
                      : "Criar conta"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <p className="pt-4 text-center text-xs text-muted-foreground">
              <Link
                to="/"
                className="underline"
              >
                Voltar para a página inicial
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
