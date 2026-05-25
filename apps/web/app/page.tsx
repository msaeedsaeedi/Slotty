"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/hooks/use-auth";

export default function Home() {
	const { isAuthenticated, isLoading } = useAuth();
	const router = useRouter();

	useEffect(() => {
		if (!isLoading) {
			if (!isAuthenticated) {
				router.replace("/login");
			} else {
				router.replace("/dashboard");
			}
		}
	}, [isLoading, isAuthenticated, router]);

	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
		</div>
	);
}
