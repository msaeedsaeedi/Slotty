"use client";

import {
	Bell,
	BookOpen,
	ClipboardList,
	GraduationCap,
	LayoutDashboard,
	LogOut,
	Menu,
	Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/lib/hooks/use-auth";
import { cn } from "@/lib/utils";

const navItems = {
	student: [
		{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
		{ href: "/courses", label: "Courses", icon: BookOpen },
		{ href: "/bookings", label: "My Bookings", icon: ClipboardList },
	],
	ta: [
		{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
		{ href: "/courses", label: "Courses", icon: BookOpen },
	],
	instructor: [
		{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
		{ href: "/courses", label: "Courses", icon: BookOpen },
	],
	admin: [
		{ href: "/admin/courses", label: "Courses", icon: BookOpen },
		{ href: "/admin/users", label: "Users", icon: Users },
		{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
	],
};

export function Header() {
	const { user, logout } = useAuth();
	const pathname = usePathname();
	const role = user?.role ?? "student";
	const items =
		(navItems as Record<string, typeof navItems.student>)[role] ??
		navItems.student;

	function initials(name: string) {
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.slice(0, 2);
	}

	function isActive(href: string) {
		return pathname === href || pathname.startsWith(`${href}/`);
	}

	return (
		<header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
			<div className="container flex h-14 items-center">
				<div className="mr-4 hidden md:flex">
					<Link href="/" className="mr-6 flex items-center space-x-2">
						<GraduationCap className="h-6 w-6" />
						<span className="hidden font-bold sm:inline-block">Slotty</span>
					</Link>
					<nav className="flex items-center gap-2 text-sm">
						{items.map((item) => (
							<Link
								key={item.href}
								href={item.href}
								className={cn(
									"inline-flex h-8 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
									isActive(item.href) &&
										"bg-secondary text-secondary-foreground",
								)}
							>
								<item.icon className="h-4 w-4" />
								{item.label}
							</Link>
						))}
					</nav>
				</div>
				<Sheet>
					<SheetTrigger className="mr-2 md:hidden">
						<Menu className="h-5 w-5" />
					</SheetTrigger>
					<SheetContent side="left" className="w-[240px]">
						<nav className="mt-4 flex flex-col gap-2">
							{items.map((item) => (
								<Link
									key={item.href}
									href={item.href}
									className={cn(
										"inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-muted",
										isActive(item.href) && "bg-secondary font-medium",
									)}
								>
									<item.icon className="h-4 w-4" />
									{item.label}
								</Link>
							))}
						</nav>
					</SheetContent>
				</Sheet>
				<div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
					<div className="w-full flex-1 md:w-auto md:flex-none" />
					<nav className="flex items-center gap-2">
						<Link href="/notifications">
							<Button variant="ghost" size="icon">
								<Bell className="h-4 w-4" />
							</Button>
						</Link>
						{user && (
							<DropdownMenu>
								<DropdownMenuTrigger className="rounded-full">
									<Avatar className="h-8 w-8">
										<AvatarFallback>{initials(user.name)}</AvatarFallback>
									</Avatar>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end" className="w-48">
									<DropdownMenuGroup>
										<DropdownMenuLabel>
											<div className="text-sm font-medium">{user.name}</div>
											<div className="text-xs text-muted-foreground">
												{user.email}
											</div>
										</DropdownMenuLabel>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											onClick={() => logout()}
											className="text-destructive"
										>
											<LogOut className="mr-2 h-4 w-4" />
											Logout
										</DropdownMenuItem>
									</DropdownMenuGroup>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</nav>
				</div>
			</div>
		</header>
	);
}
