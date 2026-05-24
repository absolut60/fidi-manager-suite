import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Building2,
  Users,
  CheckCheck,
  FileSpreadsheet,
  MessageCircle,
  Settings,
  UsersRound,
  LogOut,
  Menu,
  X,
  Building,
  ScrollText,
  ShieldCheck,
  Gavel,
  FileSignature,
  CalendarClock,
  ClipboardCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, RUOLI_LABEL } from "@/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications-bell";
import { toast } from "sonner";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Array<"admin" | "approvatore">;
  group?: "main" | "approvazioni" | "admin";
};

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "main" },
  { to: "/richieste", label: "Richieste fido", icon: FileText, group: "main" },
  { to: "/clienti", label: "Clienti", icon: Building, group: "main" },
  { to: "/contatti", label: "Contatti", icon: Users, group: "main" },
  { to: "/approvazioni", label: "Approvazioni", icon: CheckCheck, roles: ["admin", "approvatore"], group: "approvazioni" },
  { to: "/fidi-processare", label: "Fidi da processare", icon: ClipboardCheck, roles: ["admin", "approvatore"], group: "approvazioni" },
  { to: "/assicurazioni", label: "Assicurazioni", icon: ShieldCheck, roles: ["admin", "approvatore"], group: "approvazioni" },
  { to: "/legali", label: "Pratiche Legali", icon: Gavel, roles: ["admin", "approvatore"], group: "approvazioni" },
  { to: "/scadenziario", label: "Scadenziario", icon: CalendarClock, roles: ["admin", "approvatore"], group: "approvazioni" },
  { to: "/privacy", label: "Privacy", icon: FileSignature, roles: ["admin", "approvatore"], group: "approvazioni" },
  { to: "/import-export", label: "Import / Export", icon: FileSpreadsheet, roles: ["admin"], group: "approvazioni" },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle, roles: ["admin"], group: "approvazioni" },
  { to: "/impostazioni", label: "Impostazioni", icon: Settings, roles: ["admin"], group: "admin" },
  { to: "/utenti", label: "Utenti", icon: UsersRound, roles: ["admin"], group: "admin" },
  { to: "/audit", label: "Audit log", icon: ScrollText, roles: ["admin"], group: "admin" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profilo, role } = useAuth();
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  const isAdmin = role === "amministratore";
  const isApprovatore = role?.startsWith("approvatore_liv") ?? false;

  const visibleNav = NAV.filter((item) => {
    if (!item.roles) return true;
    if (item.roles.includes("admin") && isAdmin) return true;
    if (item.roles.includes("approvatore") && (isAdmin || isApprovatore)) return true;
    return false;
  });

  const grouped = {
    main: visibleNav.filter((i) => i.group === "main"),
    approvazioni: visibleNav.filter((i) => i.group === "approvazioni"),
    admin: visibleNav.filter((i) => i.group === "admin"),
  };

  async function handleLogout() {
    await supabase.auth.signOut();
    toast.success("Disconnesso");
    navigate({ to: "/login" });
  }

  const iniziali = `${profilo?.nome?.[0] ?? ""}${profilo?.cognome?.[0] ?? ""}`.toUpperCase() || "?";

  const SidebarContent = () => (
    <>
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div className="size-9 rounded-lg bg-accent flex items-center justify-center">
            <Building2 className="size-5 text-accent-foreground" />
          </div>
          <div>
            <div className="font-bold text-sidebar-foreground tracking-tight">MADE</div>
            <div className="text-[11px] text-sidebar-foreground/60 -mt-0.5">FidiManager</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        <NavGroup items={grouped.main} currentPath={currentPath} onNav={() => setMobileOpen(false)} />
        {grouped.approvazioni.length > 0 && (
          <NavGroup label="Gestione" items={grouped.approvazioni} currentPath={currentPath} onNav={() => setMobileOpen(false)} />
        )}
        {grouped.admin.length > 0 && (
          <NavGroup label="Amministrazione" items={grouped.admin} currentPath={currentPath} onNav={() => setMobileOpen(false)} />
        )}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 px-2 py-2">
          <Avatar className="size-9">
            <AvatarFallback className="bg-accent text-accent-foreground text-xs font-semibold">
              {iniziali}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-sidebar-foreground truncate">
              {profilo?.nome} {profilo?.cognome}
            </div>
            <div className="text-[11px] text-sidebar-foreground/60 truncate">
              {role ? RUOLI_LABEL[role] : "—"}
            </div>
          </div>
          <NotificationsBell />
          <button
            onClick={handleLogout}
            className="size-8 rounded-md hover:bg-sidebar-accent flex items-center justify-center text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors"
            title="Esci"
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="min-h-screen flex w-full bg-background">
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-primary text-primary-foreground flex items-center justify-between px-4 z-40 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <Building2 className="size-5 text-accent" />
          <span className="font-bold">MADE</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="text-primary-foreground hover:bg-sidebar-accent hover:text-primary-foreground"
        >
          {mobileOpen ? <X /> : <Menu />}
        </Button>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="lg:hidden fixed inset-y-0 left-0 top-14 w-72 bg-sidebar text-sidebar-foreground flex flex-col z-50 border-r border-sidebar-border">
            <SidebarContent />
          </aside>
        </>
      )}

      <main className="flex-1 lg:ml-64 pt-14 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}

function NavGroup({
  label,
  items,
  currentPath,
  onNav,
}: {
  label?: string;
  items: NavItem[];
  currentPath: string;
  onNav: () => void;
}) {
  return (
    <div>
      {label && (
        <div className="px-3 mb-2 text-[10px] font-semibold tracking-wider uppercase text-sidebar-foreground/50">
          {label}
        </div>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active = currentPath === item.to || currentPath.startsWith(item.to + "/");
          return (
            <li key={item.to}>
              <Link
                to={item.to}
                onClick={onNav}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
