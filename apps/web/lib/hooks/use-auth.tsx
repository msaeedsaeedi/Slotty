"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useCallback, useContext } from "react";
import { authApi } from "@/lib/api/auth";
import type { User, UserRole } from "@/lib/types";

interface AuthState {
	user: User | null;
	isLoading: boolean;
	isAuthenticated: boolean;
	login: () => void;
	logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const queryClient = useQueryClient();

	const { data, isLoading } = useQuery({
		queryKey: ["auth", "me"],
		queryFn: async () => {
			try {
				const res = await authApi.me();
				return res.data.user;
			} catch {
				return null;
			}
		},
		staleTime: 5 * 60 * 1000,
		retry: false,
	});

	const login = useCallback(() => {
		window.location.href = "/api/v1/auth/google";
	}, []);

	const logout = useCallback(async () => {
		await authApi.logout();
		queryClient.setQueryData(["auth", "me"], null);
		queryClient.clear();
		window.location.href = "/login";
	}, [queryClient]);

	return (
		<AuthContext.Provider
			value={{
				user: data ?? null,
				isLoading,
				isAuthenticated: !!data,
				login,
				logout,
			}}
		>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const ctx = useContext(AuthContext);
	if (!ctx) throw new Error("useAuth must be used within AuthProvider");
	return ctx;
}

export function useRequiredAuth(_allowedRoles?: UserRole[]) {
	const auth = useAuth();
	const { user, isLoading, isAuthenticated } = auth;
	if (!isLoading && !isAuthenticated) {
		window.location.href = "/login";
	}
	return { user, isLoading, isAuthenticated };
}
