import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  FileText,
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
  ClipboardList,
  HandCoins,
  TrendingUp,
  LineChart,
  Mail,
  Megaphone,
  CreditCard,
  Banknote,
  AlertTriangle,
  Wrench,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { LOGO_MADE_SIDEBAR_BASE64 } from "@/lib/logo-made-sidebar-base64";
import { useAuth, RUOLI_LABEL } from "@/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications-bell";
import { toast } from "sonner";

type NavGroupKey =
  | "generale"
  | "fidi"
  | "incassi"
  | "recupero"
  | "strumenti"
  | "admin"
  | "richieste_interne";

type RichiesteScope = "all" | "manage" | "approve" | "gestione";

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Array<"admin" | "approvatore" | "store_manager" | "amministrazione">;
  group: NavGroupKey;
  richiesteScope?: RichiesteScope;
  exact?: boolean;
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
  // RICHIESTE INTERNE
  { to: "/richieste-interne", label: "Richieste — Dashboard", icon: LayoutDashboard, group: "richieste_interne", richiesteScope: "all", exact: true },
  { to: "/richieste-interne/mie", label: "Le mie richieste", icon: FileText, group: "richieste_interne", richiesteScope: "all" },
  { to: "/richieste-interne/approva", label: "Da approvare", icon: CheckCheck, group: "richieste_interne", richiesteScope: "approve" },
  { to: "/richieste-interne/gestione", label: "Gestione", icon: ClipboardCheck, group: "richieste_interne", richiesteScope: "gestione" },
  { to: "/richieste-interne/tutte", label: "Tutte le richieste", icon: FileSpreadsheet, group: "richieste_interne", richiesteScope: "manage" },
  { to: "/richieste-interne/archivio", label: "Archivio", icon: ScrollText, group: "richieste_interne", richiesteScope: "manage" },
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

// Colori per blocco (bar = 3px verticale a sx della voce, label = titolo header)
type GroupStyle = { bar: string; label: string; icon: typeof LayoutDashboard };
const GROUP_STYLES: Record<Exclude<NavGroupKey, "generale">, GroupStyle> = {
  fidi:               { bar: "#7f77dd", label: "#a8a2e8", icon: CreditCard },
  incassi:            { bar: "#1d9e75", label: "#5dcaa5", icon: Banknote },
  recupero:           { bar: "#d85a30", label: "#f0997b", icon: AlertTriangle },
  richieste_interne:  { bar: "#378add", label: "#85b7eb", icon: ClipboardList },
  strumenti:          { bar: "#888780", label: "#b4b2a9", icon: Wrench },
  admin:              { bar: "#888780", label: "#b4b2a9", icon: Settings },
};

const GROUP_LABELS: Record<Exclude<NavGroupKey, "generale">, string> = {
  fidi: "Fidi",
  incassi: "Incassi",
  recupero: "Recupero crediti",
  richieste_interne: "Richieste interne",
  strumenti: "Strumenti",
  admin: "Amministrazione",
};

const OPEN_STORAGE_KEY = "fidimanager.menu.blocchi.aperti";

function isItemActive(item: NavItem, currentPath: string) {
  if (item.exact) return currentPath === item.to;
  return currentPath === item.to || currentPath.startsWith(item.to + "/");
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profilo, role, roles } = useAuth();
  const navigate = useNavigate();
  const currentPath = useRouterState({ select: (s) => s.location.pathname });

  const userRoles = roles as string[];
  const hasUserRole = (r: string) => userRoles.includes(r);
  const isAdmin = hasUserRole("amministratore");
  const isApprovatore = userRoles.some((r) => r.startsWith("approvatore_liv"));
  const isStoreManager = hasUserRole("store_manager");
  const isAmministrazione = hasUserRole("amministrazione");
  const isAgente = hasUserRole("agente");
  const isOnlyAgente =
    isAgente && !isAdmin && !isApprovatore && !isStoreManager && !isAmministrazione && !hasUserRole("direzione");

  const AGENTE_WHITELIST = new Set<string>([
    "/clienti",
    "/contatti",
    "/scadenziario",
    "/recupero-crediti",
    "/recupero-crediti-calendario",
    "/recupero-crediti-promemoria",
    "/piani-rientro",
  ]);

  const RICHIESTE_ROLES = [
    "richiedente",
    "approvatore_richieste_liv1",
    "approvatore_richieste_liv2",
    "gestore_richieste",
    "esecutore_richieste",
  ];
  const hasAnyRichiesteRole = RICHIESTE_ROLES.some((r) => hasUserRole(r));
  const canSeeRichiesteInterne = isAdmin || hasAnyRichiesteRole;
  const isApprovatoreRichLiv1 = hasUserRole("approvatore_richieste_liv1");
  const isApprovatoreRichLiv2 = hasUserRole("approvatore_richieste_liv2");
  const isGestoreRich = hasUserRole("gestore_richieste");
  const isEsecutoreRich = hasUserRole("esecutore_richieste");
  const canApproveRich = isAdmin || isApprovatoreRichLiv1 || isApprovatoreRichLiv2;
  const canManageRich = isAdmin || isApprovatoreRichLiv1 || isApprovatoreRichLiv2 || isGestoreRich || isEsecutoreRich;
  const canGestioneRich = isAdmin || isGestoreRich || isEsecutoreRich;

  const visibleNav = NAV.filter((item) => {
    if (item.group === "richieste_interne") {
      if (!canSeeRichiesteInterne) return false;
      if (item.richiesteScope === "approve") return canApproveRich;
      if (item.richiesteScope === "manage") return canManageRich;
      if (item.richiesteScope === "gestione") return canGestioneRich;
      return true;
    }
    if (isOnlyAgente) return AGENTE_WHITELIST.has(item.to);
    if (!item.roles) return true;
    if (item.roles.includes("admin") && isAdmin) return true;
    if (item.roles.includes("approvatore") && (isAdmin || isApprovatore)) return true;
    if (item.roles.includes("store_manager") && (isAdmin || isApprovatore || isStoreManager)) return true;
    if (item.roles.includes("amministrazione") && isAmministrazione) return true;
    return false;
  });

  const generaleItems = visibleNav.filter((i) => i.group === "generale");
  const blocchiKeys: Array<Exclude<NavGroupKey, "generale">> = [
    "fidi",
    "incassi",
    "recupero",
    "richieste_interne",
    "strumenti",
    "admin",
  ];
  const blocchi = blocchiKeys
    .map((key) => ({ key, items: visibleNav.filter((i) => i.group === key) }))
    .filter((b) => b.items.length > 0);

  // Blocco che contiene la rotta corrente (sempre aperto)
  const activeGroup = useMemo<Exclude<NavGroupKey, "generale"> | null>(() => {
    for (const b of blocchi) {
      if (b.items.some((it) => isItemActive(it, currentPath))) {
        return b.key;
      }
    }
    return null;
  }, [blocchi, currentPath]);

  // Stato aperto/chiuso: primo render = solo activeGroup (deterministico SSR),
  // dopo il mount applichiamo lo stato salvato.
  const [openBlocks, setOpenBlocks] = useState<Set<string>>(() => {
    return new Set(activeGroup ? [activeGroup] : []);
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPEN_STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as string[];
        setOpenBlocks(new Set(arr));
      }
    } catch {
      // ignore
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persisti quando cambia (solo dopo hydration)
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(OPEN_STORAGE_KEY, JSON.stringify(Array.from(openBlocks)));
    } catch {
      // ignore
    }
  }, [openBlocks, hydrated]);

  function toggleBlock(key: string) {
    setOpenBlocks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

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

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {generaleItems.length > 0 && (
          <ul className="space-y-0.5">
            {generaleItems.map((item) => (
              <NavItemRow
                key={item.to}
                item={item}
                active={isItemActive(item, currentPath)}
                onNav={() => setMobileOpen(false)}
              />
            ))}
          </ul>
        )}

        {blocchi.map((b) => {
          const style = GROUP_STYLES[b.key];
          // activeGroup forza sempre aperto, anche se l'utente ha chiuso
          const isOpen = openBlocks.has(b.key) || activeGroup === b.key;
          const HeaderIcon = style.icon;
          return (
            <div key={b.key}>
              <button
                type="button"
                onClick={() => toggleBlock(b.key)}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md hover:bg-sidebar-accent/40 transition-colors group"
              >
                <HeaderIcon className="size-3.5 shrink-0" style={{ color: style.label }} />
                <span
                  className="flex-1 text-left text-[11px] font-semibold tracking-wider uppercase truncate"
                  style={{ color: style.label }}
                >
                  {GROUP_LABELS[b.key]}
                </span>
                {isOpen ? (
                  <ChevronDown className="size-3.5" style={{ color: style.label }} />
                ) : (
                  <ChevronRight className="size-3.5" style={{ color: style.label }} />
                )}
              </button>
              {isOpen && (
                <ul className="mt-1 space-y-0.5">
                  {b.items.map((item) => (
                    <NavItemRow
                      key={item.to}
                      item={item}
                      active={isItemActive(item, currentPath)}
                      onNav={() => setMobileOpen(false)}
                      barColor={style.bar}
                    />
                  ))}
                </ul>
              )}
            </div>
          );
        })}
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

      <aside className="hidden lg:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {mobileOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/50 z-40" onClick={() => setMobileOpen(false)} />
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

function NavItemRow({
  item,
  active,
  onNav,
  barColor,
}: {
  item: NavItem;
  active: boolean;
  onNav: () => void;
  barColor?: string;
}) {
  const Icon = item.icon;
  return (
    <li>
      <Link
        to={item.to}
        onClick={onNav}
        activeOptions={item.exact ? { exact: true } : undefined}
        className={`relative flex items-center gap-3 pl-4 pr-3 py-2 rounded-md text-sm transition-colors ${
          active
            ? "bg-accent text-accent-foreground font-medium"
            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
        }`}
      >
        {barColor && (
          <span
            aria-hidden
            className="absolute left-1 top-1.5 bottom-1.5 rounded-full"
            style={{ width: 3, backgroundColor: barColor }}
          />
        )}
        <Icon className="size-4 shrink-0" />
        <span className="truncate">{item.label}</span>
      </Link>
    </li>
  );
}
