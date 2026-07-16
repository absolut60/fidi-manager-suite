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
  HandCoins,
  TrendingUp,
  LineChart,
  Mail,
  Megaphone,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LOGO_MADE_BASE64 } from "@/lib/logo-made-base64";
import { LOGO_MADE_SIDEBAR_BASE64 } from "@/lib/logo-made-sidebar-base64";
import { useAuth, RUOLI_LABEL } from "@/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications-bell";
import { toast } from "sonner";

type NavGroupKey = "generale" | "fidi" | "incassi" | "recupero" | "strumenti" | "admin" | "richieste_interne";

// Per le voci del gruppo "richieste_interne": scope di visibilità aggiuntivo.
// - "all"    → dashboard/mie: chiunque abbia un ruolo richieste_* o admin
// - "manage" → tutte/archivio: liv1, liv2, gestore, esecutore, admin
// - "approve"→ da approvare: liv1, liv2, admin
type RichiesteScope = "all" | "manage" | "approve";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Array<"admin" | "approvatore" | "store_manager" | "amministrazione">;
  group: NavGroupKey;
  richiesteScope?: RichiesteScope;
};

const NAV: NavItem[] = [
  // GENERALE
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "generale" },
  { to: "/clienti", label: "Clienti", icon: Building, group: "generale" },
  { to: "/contatti", label: "Contatti", icon: Users, group: "generale" },
  // FIDI
  { to: "/richieste", label: "Richieste fido", icon: FileText, group: "fidi" },
  { to: "/approvazioni", label: "Approvazioni", icon: CheckCheck, roles: ["admin", "approvatore"], group: "fidi" },
  { to: "/fidi-processare", label: "Fidi da processare", icon: ClipboardCheck, roles: ["admin", "approvatore"], group: "fidi" },
  { to: "/assicurazioni", label: "Assicurazioni", icon: ShieldCheck, roles: ["admin", "approvatore", "store_manager"], group: "fidi" },
  // INCASSI
  { to: "/scadenziario", label: "Scadenziario", icon: CalendarClock, roles: ["admin", "approvatore", "store_manager"], group: "incassi" },
  { to: "/cruscotto-incassi", label: "Cruscotto incassi", icon: LineChart, roles: ["admin", "approvatore", "store_manager"], group: "incassi" },
  { to: "/recupero-crediti-promemoria", label: "Promemoria scadenza", icon: CalendarClock, roles: ["admin", "approvatore", "store_manager"], group: "incassi" },
  // RECUPERO CREDITI
  { to: "/recupero-crediti", label: "Recupero Crediti", icon: HandCoins, roles: ["admin", "approvatore", "store_manager"], group: "recupero" },
  { to: "/recupero-crediti-calendario", label: "Calendario Recupero", icon: CalendarClock, roles: ["admin", "approvatore", "store_manager"], group: "recupero" },
  { to: "/piani-rientro", label: "Piani di rientro", icon: CalendarClock, roles: ["admin", "approvatore", "store_manager"], group: "recupero" },
  { to: "/recupero-crediti-campagne", label: "Invii massivi", icon: Megaphone, roles: ["admin", "approvatore", "store_manager"], group: "recupero" },
  { to: "/legali", label: "Pratiche Legali", icon: Gavel, roles: ["admin", "approvatore", "store_manager"], group: "recupero" },
  { to: "/recupero-crediti-andamento", label: "Andamento / Storico", icon: TrendingUp, roles: ["admin", "approvatore", "store_manager"], group: "recupero" },
  // RICHIESTE INTERNE (gate applicato a livello di gruppo, non per singola voce)
  { to: "/richieste-interne", label: "Richieste — Dashboard", icon: LayoutDashboard, group: "richieste_interne" },
  { to: "/richieste-interne/mie", label: "Le mie richieste", icon: FileText, group: "richieste_interne" },
  // STRUMENTI
  { to: "/import-export", label: "Import / Export", icon: FileSpreadsheet, roles: ["admin", "amministrazione"], group: "strumenti" },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle, roles: ["admin"], group: "strumenti" },
  { to: "/privacy", label: "Privacy", icon: FileSignature, roles: ["admin", "approvatore", "store_manager"], group: "strumenti" },
  // AMMINISTRAZIONE
  { to: "/template-email", label: "Template Email", icon: Mail, roles: ["admin"], group: "admin" },
  { to: "/template-lettera", label: "Template Lettere", icon: FileText, roles: ["admin"], group: "admin" },
  { to: "/impostazioni", label: "Impostazioni", icon: Settings, roles: ["admin"], group: "admin" },
  { to: "/utenti", label: "Utenti", icon: UsersRound, roles: ["admin"], group: "admin" },
  { to: "/audit", label: "Audit log", icon: ScrollText, roles: ["admin"], group: "admin" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profilo, role, roles } = useAuth();
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  // I ruoli sono multi-riga in user_roles: il menu deve controllare l'appartenenza
  // all'array completo, non solo il ruolo principale calcolato per priorità.
  const userRoles = roles as string[];
  const hasUserRole = (requiredRole: string) => userRoles.includes(requiredRole);
  const isAdmin = hasUserRole("amministratore");
  const isApprovatore = userRoles.some((r) => r.startsWith("approvatore_liv"));
  const isStoreManager = hasUserRole("store_manager");
  const isAmministrazione = hasUserRole("amministrazione");
  const isAgente = hasUserRole("agente");
  // Un utente è "solo agente" se ha il ruolo agente e nessuno degli altri ruoli operativi.
  const isOnlyAgente = isAgente && !isAdmin && !isApprovatore && !isStoreManager && !isAmministrazione && !hasUserRole("direzione");

  // Whitelist voci di menu per l'agente puro (vede solo ciò che è pertinente).
  const AGENTE_WHITELIST = new Set<string>([
    "/clienti",
    "/contatti",
    "/scadenziario",
    "/recupero-crediti",
    "/recupero-crediti-calendario",
    "/recupero-crediti-promemoria",
    "/piani-rientro",
  ]);

  const RICHIESTE_ROLES = ["richiedente", "approvatore_richieste_liv1", "approvatore_richieste_liv2", "gestore_richieste", "esecutore_richieste"];
  const hasAnyRichiesteRole = RICHIESTE_ROLES.some((r) => hasUserRole(r));
  const canSeeRichiesteInterne = isAdmin || hasAnyRichiesteRole;

  const visibleNav = NAV.filter((item) => {
    if (item.group === "richieste_interne") return canSeeRichiesteInterne;
    if (isOnlyAgente) return AGENTE_WHITELIST.has(item.to);
    if (!item.roles) return true;
    if (item.roles.includes("admin") && isAdmin) return true;
    if (item.roles.includes("approvatore") && (isAdmin || isApprovatore)) return true;
    if (item.roles.includes("store_manager") && (isAdmin || isApprovatore || isStoreManager)) return true;
    if (item.roles.includes("amministrazione") && isAmministrazione) return true;
    return false;
  });

  const grouped: Array<{ key: NavGroupKey; label?: string; items: NavItem[] }> = [
    { key: "generale", items: visibleNav.filter((i) => i.group === "generale") },
    { key: "fidi", label: "Fidi", items: visibleNav.filter((i) => i.group === "fidi") },
    { key: "incassi", label: "Incassi", items: visibleNav.filter((i) => i.group === "incassi") },
    { key: "recupero", label: "Recupero crediti", items: visibleNav.filter((i) => i.group === "recupero") },
    { key: "richieste_interne", label: "Richieste interne", items: visibleNav.filter((i) => i.group === "richieste_interne") },
    { key: "strumenti", label: "Strumenti", items: visibleNav.filter((i) => i.group === "strumenti") },
    { key: "admin", label: "Amministrazione", items: visibleNav.filter((i) => i.group === "admin") },
  ];

  async function handleLogout() {
    await supabase.auth.signOut();
    toast.success("Disconnesso");
    navigate({ to: "/login" });
  }

  const iniziali = `${profilo?.nome?.[0] ?? ""}${profilo?.cognome?.[0] ?? ""}`.toUpperCase() || "?";

  const SidebarContent = () => (
    <>
      <div className="px-5 py-5 border-b border-sidebar-border">
        <div className="flex flex-col gap-1.5">
          <img
            src={`data:image/png;base64,${LOGO_MADE_SIDEBAR_BASE64}`}
            alt="MADE"
            className="w-44 h-auto block"
            style={{ aspectRatio: "490 / 69" }}
          />
          <div className="text-[11px] text-sidebar-foreground/60">FidiManager</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {grouped.map((g) =>
          g.items.length === 0 ? null : (
            <NavGroup
              key={g.key}
              label={g.label}
              items={g.items}
              currentPath={currentPath}
              onNav={() => setMobileOpen(false)}
            />
          )
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
          <img
            src={`data:image/png;base64,${LOGO_MADE_SIDEBAR_BASE64}`}
            alt="MADE"
            className="w-32 h-auto block"
            style={{ aspectRatio: "490 / 69" }}
          />
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
