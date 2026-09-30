import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Bell,
  BookOpenCheck,
  Check,
  ChevronsUpDown,
  CircleHelp,
  Grid2x2,
  Languages,
  LogOut,
  MessageCircleQuestion,
  Moon,
  Search,
  Sun,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

import { AssistantPanel } from "@/components/app/AssistantPanel";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useApp } from "@/lib/app-context";
import { logoutAppUser } from "@/lib/auth.functions";
import { emitAuthChange } from "@/hooks/use-session";
import { useI18n } from "@/lib/i18n";
import { APP_MODULES, LAUNCHER_UTILITIES } from "@/lib/modules";
import { useTheme } from "@/lib/theme";
import appLogo from "@/assets/xperd-one.png";

export function AppTopbar({ workspaceId }: { workspaceId: string }) {
  const { workspaces, activeWorkspace, tenant, email, setActiveWorkspaceId, canViewModule, canViewSubmodule } = useApp();
  const { lang, setLang } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const entries = useMemo(
    () => [
      // #59: hanya modul/submodul yang boleh dilihat peran ini yang muncul.
      ...APP_MODULES.filter((m) => canViewModule(m.id)).flatMap((m) => [
        { label: lang === "id" ? m.id_ : m.en, to: `/app/w/${workspaceId}/${m.id}`, group: lang === "id" ? "Modul" : "Modules" },
        ...m.submodules
          .filter((sub) => canViewSubmodule(m.id, sub.id))
          .map((sub) => ({
            label: `${lang === "id" ? m.id_ : m.en} · ${lang === "id" ? sub.id_ : sub.en}`,
            to: `/app/w/${workspaceId}/${m.id}/${sub.id}`,
            group: lang === "id" ? "Sub modul" : "Sub modules",
          })),
      ]),
      ...LAUNCHER_UTILITIES.map((u) => ({
        label: lang === "id" ? u.id_ : u.en,
        to: `/app/w/${workspaceId}/${u.id}`,
        group: lang === "id" ? "Pengaturan" : "Workspace",
      })),
    ],
    [lang, workspaceId, canViewModule, canViewSubmodule],
  );

  const groups = useMemo(() => {
    const map = new Map<string, typeof entries>();
    entries.forEach((e) => {
      const list = map.get(e.group) ?? [];
      list.push(e);
      map.set(e.group, list);
    });
    return [...map.entries()];
  }, [entries]);

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur lg:px-6">
      <Link to="/app/w/$workspaceId" params={{ workspaceId }} className="flex shrink-0 items-center">
        <img
          src={appLogo}
          alt="XPERD One — Smart ERP Solution"
          className="h-8 w-auto dark:brightness-0 dark:invert"
          loading="eager"
          decoding="async"
        />
      </Link>

      <button
        onClick={() => setSearchOpen(true)}
        className="mx-auto flex items-center gap-2 rounded-full border border-border bg-secondary/50 px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary md:w-96"
      >
        <Search className="h-4 w-4" />
        <span className="hidden md:inline">{lang === "id" ? "Cari modul…" : "Search modules…"}</span>
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="hidden max-w-[220px] items-center gap-2 rounded-lg border border-border bg-secondary/60 px-3 py-1.5 text-left text-sm lg:flex">
            <span className="min-w-0">
              <span className="block truncate font-medium">{activeWorkspace?.name ?? "Workspace"}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{tenant?.name}</span>
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>{lang === "id" ? "Ganti workspace" : "Switch workspace"}</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem
              key={w.id}
              onSelect={() => {
                setActiveWorkspaceId(w.id);
                navigate({ to: "/app/w/$workspaceId", params: { workspaceId: w.id } });
              }}
            >
              <span className="flex-1 truncate">{w.name}</span>
              {w.id === activeWorkspace?.id && <Check className="h-4 w-4 text-gold" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => navigate({ to: "/app" })}>
            <Grid2x2 className="h-4 w-4" /> {lang === "id" ? "Semua workspace" : "All workspaces"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <div className="flex shrink-0 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={lang === "id" ? "Panduan dan XPERD Assistant" : "Guide and XPERD Assistant"}
            >
              <CircleHelp className="h-4 w-4 text-gold" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>{lang === "id" ? "Pusat Bantuan XPERD" : "XPERD Help Center"}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => navigate({ to: "/app/w/$workspaceId/guide", params: { workspaceId } })}
            >
              <BookOpenCheck className="h-4 w-4 text-gold" />
              <span>
                <span className="block font-medium">{lang === "id" ? "Panduan Pengguna" : "User Guide"}</span>
                <span className="block text-[11px] text-muted-foreground">
                  {lang === "id" ? "Baca langkah penggunaan" : "Read step-by-step guidance"}
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setAssistantOpen(true)}>
              <MessageCircleQuestion className="h-4 w-4 text-gold" />
              <span>
                <span className="block font-medium">XPERD Assistant</span>
                <span className="block text-[11px] text-muted-foreground">
                  {lang === "id" ? "Tanyakan hal yang belum jelas" : "Ask about anything unclear"}
                </span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-gold" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="border-b border-border px-4 py-3 text-sm font-medium">
              {lang === "id" ? "Notifikasi" : "Notifications"}
            </div>
            <div className="space-y-3 p-4 text-sm">
              <div className="rounded-lg bg-secondary/60 p-3">
                <p className="font-medium text-foreground">
                  {lang === "id" ? "Workspace siap digunakan" : "Workspace is ready"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {lang === "id"
                    ? "Lengkapi master data untuk mulai transaksi."
                    : "Complete master data to start transacting."}
                </p>
              </div>
              <div className="rounded-lg bg-secondary/60 p-3">
                <p className="font-medium text-foreground">{lang === "id" ? "Undang tim" : "Invite your team"}</p>
                <p className="text-xs text-muted-foreground">
                  {lang === "id" ? "Tambahkan pengguna sesuai kuota paket." : "Add users within your package quota."}
                </p>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Language">
              <Languages className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setLang("en")}>
              English {lang === "en" && <Check className="h-4 w-4 text-gold" />}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setLang("id")}>
              Bahasa Indonesia {lang === "id" && <Check className="h-4 w-4 text-gold" />}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Account">
              <UserRound className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
              {email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate({ to: "/app/w/$workspaceId/settings", params: { workspaceId } })}>
              {lang === "id" ? "Pengaturan workspace" : "Workspace settings"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={async () => {
                await logoutAppUser();
                emitAuthChange();
                toast.success(lang === "id" ? "Berhasil keluar" : "Signed out");
                navigate({ to: "/auth", search: { next: undefined }, replace: true });
              }}
            >
              <LogOut className="h-4 w-4" /> {lang === "id" ? "Keluar" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder={lang === "id" ? "Cari modul atau sub modul…" : "Search modules or sub modules…"} />
        <CommandList>
          <CommandEmpty>{lang === "id" ? "Tidak ditemukan." : "No results found."}</CommandEmpty>
          {groups.map(([group, items]) => (
            <CommandGroup key={group} heading={group}>
              {items.map((item) => (
                <CommandItem
                  key={item.to}
                  value={item.label}
                  onSelect={() => {
                    setSearchOpen(false);
                    navigate({ to: item.to });
                  }}
                >
                  {item.label}
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>

      <AssistantPanel open={assistantOpen} onOpenChange={setAssistantOpen} context={activeWorkspace?.name} />
    </header>
  );
}