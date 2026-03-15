import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Briefcase,
  CalendarCheck,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Scale,
  ShieldCheck,
  Sun,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const navSections = [
  {
    label: "Overview",
    items: [
      { label: "Overview Dashboard", to: "/admin/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Users",
    items: [{ label: "User Management", to: "/admin/users", icon: Users }],
  },
  {
    label: "Operations",
    items: [
      { label: "Verification Queue", to: "/admin/verification", icon: ShieldCheck },
      { label: "Requests & Bookings", to: "/admin/bookings", icon: CalendarCheck },
      { label: "Service & Specialty Catalog", to: "/admin/services", icon: Briefcase },
    ],
  },
  {
    label: "Trust & Finance",
    items: [
      { label: "Trust and Safety", to: "/admin/trust", icon: AlertTriangle },
      { label: "Dispute Center", to: "/admin/disputes", icon: Scale },
      { label: "Wallet & Token Ledger", to: "/admin/wallet", icon: Wallet },
    ],
  },
];

const titleByPath = {
  "/admin/dashboard": "Overview Dashboard",
  "/admin/users": "User Management",
  "/admin/verification": "Verification Queue",
  "/admin/bookings": "Requests & Bookings",
  "/admin/services": "Service Catalog",
  "/admin/trust": "Trust and Safety",
  "/admin/disputes": "Dispute Center",
  "/admin/wallet": "Wallet & Token Ledger",
};

const navLinkClassName =
  "flex items-center gap-3 px-4 py-2.5 rounded-lg mx-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors";
const navLinkActiveClassName = "bg-primary text-primary-foreground hover:bg-primary/90";
const THEME_STORAGE_KEY = "mechconnect-admin-theme";

function getInitialThemeMode() {
  if (typeof window === "undefined") {
    return "dark";
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }

  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function getDisplayName(user) {
  if (!user) {
    return "Administrator";
  }
  const fullName = [user.firstname, user.lastname].filter(Boolean).join(" ");
  return fullName || user.username || "Administrator";
}

function getInitials(user) {
  if (!user) {
    return "AD";
  }
  const initials = [user.firstname?.[0], user.lastname?.[0]].filter(Boolean).join("");
  if (initials) {
    return initials.toUpperCase();
  }
  if (user.username) {
    return user.username.slice(0, 2).toUpperCase();
  }
  return "AD";
}

function SidebarLinks({ onNavigate }) {
  return (
    <>
      {navSections.map((section) => (
        <section key={section.label}>
          <p className="px-4 pt-5 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {section.label}
          </p>
          <nav className="space-y-1">
            {section.items.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(navLinkClassName, isActive && navLinkActiveClassName)
                  }
                  onClick={onNavigate}
                >
                  <Icon className="size-4" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
        </section>
      ))}
    </>
  );
}

export function AdminLayout({ children, title }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [themeMode, setThemeMode] = useState(getInitialThemeMode);
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const displayName = useMemo(() => getDisplayName(user), [user]);
  const initials = useMemo(() => getInitials(user), [user]);
  const pageTitle = title || titleByPath[location.pathname] || "Admin";

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    document.documentElement.classList.toggle("dark", themeMode === "dark");
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  async function handleSignOut() {
    await signOut();
    navigate("/admin/login", { replace: true });
  }

  function handleToggleTheme() {
    setThemeMode((prev) => (prev === "dark" ? "light" : "dark"));
  }

  return (
    <div className="flex h-dvh min-h-dvh bg-background overflow-hidden">
      <aside className="hidden md:flex flex-col w-60 bg-card text-card-foreground border-r border-border">
        <div className="flex items-center gap-2 px-6 py-5 border-b border-border">
          <Wrench className="size-5 text-primary" />
          <span className="text-base font-bold text-foreground">Mechconnect</span>
        </div>

        <ScrollArea className="flex-1">
          <SidebarLinks />
        </ScrollArea>

        <div className="mt-auto">
          <Separator className="bg-border" />
          <div className="px-4 py-4">
            <div className="flex items-center gap-3">
              <Avatar className="size-10 border border-border">
                <AvatarFallback className="bg-muted text-foreground">{initials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
                <Badge variant="secondary" className="mt-1">
                  Admin
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b bg-background px-3 py-4 sm:px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[78vw] max-w-[18.5rem] border-border bg-card p-0 text-card-foreground sm:max-w-xs">
                <div className="flex items-center gap-2 border-b border-border px-5 py-4 pr-12">
                  <Wrench className="size-5 text-primary" />
                  <span className="text-base font-bold text-foreground">Mechconnect</span>
                </div>
                <ScrollArea className="h-[calc(100dvh-69px)]">
                  <div className="pb-6 pt-2">
                    {navSections.map((section) => (
                    <section key={section.label}>
                      <p className="px-5 pb-2 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {section.label}
                      </p>
                      <nav className="space-y-1 px-2">
                        {section.items.map((item) => {
                          const Icon = item.icon;
                          return (
                            <SheetClose key={item.to} asChild>
                              <NavLink
                                to={item.to}
                                className={({ isActive }) =>
                                  cn(
                                    "mx-1.5 flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                                    isActive && "bg-primary text-primary-foreground hover:bg-primary/90",
                                  )
                                }
                                onClick={() => setMobileOpen(false)}
                              >
                                <Icon className="size-4" />
                                <span>{item.label}</span>
                              </NavLink>
                            </SheetClose>
                          );
                        })}
                      </nav>
                    </section>
                  ))}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
            <h1 className="max-w-[62vw] truncate text-base font-semibold sm:max-w-none sm:text-lg">{pageTitle}</h1>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
              onClick={handleToggleTheme}
              aria-label={themeMode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {themeMode === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              <span className="hidden sm:inline">{themeMode === "dark" ? "Light" : "Dark"} Mode</span>
            </Button>

            <p className="hidden lg:block text-sm text-muted-foreground">{displayName}</p>

            <Button
              variant="outline"
              className="hidden sm:inline-flex"
              onClick={handleSignOut}
            >
              Sign Out
            </Button>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Notifications">
                    <Bell className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Notifications</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-auto rounded-full p-0">
                  <Avatar className="size-9 border">
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="text-sm font-semibold">{displayName}</p>
                  <p className="text-xs font-normal text-muted-foreground">{user?.email || "admin@mechconnect"}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="size-4" />
                  <span>Sign Out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
