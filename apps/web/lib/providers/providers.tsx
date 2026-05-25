"use client";

import {
	isServer,
	QueryClient,
	QueryClientProvider,
} from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/hooks/use-auth";

function makeQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: {
				staleTime: 30 * 1000,
				retry: 1,
			},
		},
	});
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
	if (isServer) {
		return makeQueryClient();
	}
	if (!browserQueryClient) {
		browserQueryClient = makeQueryClient();
	}
	return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
	const queryClient = getQueryClient();

	return (
		<QueryClientProvider client={queryClient}>
			<AuthProvider>{children}</AuthProvider>
			<Toaster richColors />
		</QueryClientProvider>
	);
}
