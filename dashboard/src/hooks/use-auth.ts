
import {
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { api } from "@/services/api";
import type {
  AppRole,
  TennisLevel,
} from "@/lib/domain";

export type SessionProfile = {
  id: string;
  full_name: string;
  email: string | null;
  tennis_level: TennisLevel | null;
  institution: string | null;
  coach_id: string | null;
};

export type CurrentUser = {
  userId: string;
  email: string | null;
  profile: SessionProfile | null;
  role: AppRole;
};

type ApiUser = {
  id?: string | number;
  userId?: string | number;
  email?: string | null;
  role?: string;
};

type MeResponse = {
  user?: ApiUser;
  profile?: SessionProfile | null;
  id?: string | number;
  userId?: string | number;
  email?: string | null;
  role?: string;
};

function isAppRole(value: unknown): value is AppRole {
  return (
    value === "praticante" ||
    value === "treinador" ||
    value === "admin"
  );
}

export function useCurrentUser() {
  return useQuery<CurrentUser | null>({
    queryKey: ["current-user"],

    queryFn: async () => {
      if (typeof window === "undefined") {
        return null;
      }

      const token = localStorage.getItem(
        "@SmartTennis:token"
      );

      if (!token) {
        return null;
      }

      const { data } = await api.get<MeResponse>("/me");

      const user = data.user ?? data;

      const userId = user.id ?? user.userId;
      const role = user.role;

      if (userId == null || !isAppRole(role)) {
        throw new Error(
          "O servidor retornou dados de autenticação inválidos."
        );
      }

      return {
        userId: String(userId),
        email: user.email ?? null,
        profile: data.profile ?? null,
        role,
      };
    },

    staleTime: 30000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}

export function useSignOut() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const router = useRouter();

  return async () => {
    await queryClient.cancelQueries();

    localStorage.removeItem(
      "@SmartTennis:token"
    );

    localStorage.removeItem(
      "@SmartTennis:user"
    );

    queryClient.clear();

    await router.invalidate();

    await navigate({
      to: "/auth",
      replace: true,
    });
  };
}
