import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { LayoutList, FileSpreadsheet, BarChart3, Shield, Users, Database, Server } from "lucide-react";

const Sidebar = () => {
  const { pathname } = useLocation();
  const itemClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
      active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
    );

  const getPerms = () => {
    try {
      const p = localStorage.getItem("auth_perms");
      return p ? JSON.parse(p) as string[] : [];
    } catch {
      return [];
    }
  };
  const role = (() => { try { return (localStorage.getItem("auth_role") || "").toLowerCase(); } catch { return ""; } })();
  const [perms, setPerms] = ((): [string[], (v: string[]) => void] => {
    const initial = getPerms();
    return [initial, (v) => setTimeout(() => localStorage.setItem("auth_perms", JSON.stringify(v)), 0) as unknown as (v: string[]) => void];
  })();

  const isAllowed = (path: string) => {
    if (role === "admin") return true;
    if (!perms || perms.length === 0) return true; // default allow if not loaded
    return perms.includes(path);
  };

  const settingsPaths = [
    "/settings",
    "/settings/dicom",
    "/settings/database",
    "/settings/idrl-national",
  ];
  const hasSettingsAccess = role === "admin" || (Array.isArray(perms) && settingsPaths.some((p) => perms.includes(p)));

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("ui_sidebar_collapsed") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("ui_sidebar_collapsed", collapsed ? "1" : "0"); } catch {}
    try { document.documentElement.style.setProperty("--sidebar-width", collapsed ? "80px" : "240px"); } catch {}
  }, [collapsed]);

  const handleAsideClick = (e: React.MouseEvent<HTMLElement>) => {
    if (collapsed) {
      const t = e.target as HTMLElement;
      if (t.closest("a")) {
        e.preventDefault();
      }
      setCollapsed(false);
    }
  };
  const handleAsideDoubleClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!collapsed) {
      const t = e.target as HTMLElement;
      if (t.closest("a")) return;
      setCollapsed(true);
    }
  };
  return (
    <aside
      className="fixed left-0 top-0 z-20 h-screen border-r border-border bg-card p-4 flex flex-col transition-all duration-300"
      style={{ width: "var(--sidebar-width)" }}
      onClick={handleAsideClick}
      onDoubleClick={handleAsideDoubleClick}
    >
      <div className="mb-2 flex items-center px-2">
        <img src="/radiation-icon.svg" alt="Logo" className="h-6 w-6" />
        {!collapsed && <span className="ml-2 text-lg font-bold text-foreground">Dose Manager</span>}
      </div>
      <nav className="space-y-1 flex-1">
        {!collapsed && <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">Dose Management</div>}
        {isAllowed("/dashboard") && (
        <Link to="/dashboard" className={itemClass(pathname === "/dashboard")}> 
          <BarChart3 className="h-4 w-4" />
          {!collapsed && <span>Dashboard</span>}
        </Link>
        )}
        {isAllowed("/worklist") && (
        <Link to="/worklist" className={itemClass(pathname === "/worklist")}> 
          <LayoutList className="h-4 w-4" />
          {!collapsed && <span>Worklist</span>}
        </Link>
        )}
        {isAllowed("/reporting") && (
        <Link to="/reporting" className={itemClass(pathname === "/reporting")}> 
          <FileSpreadsheet className="h-4 w-4" />
          {!collapsed && <span>Reporting</span>}
        </Link>
        )}
        {hasSettingsAccess && !collapsed && (
          <>
            <div className="my-2 border-t border-border" />
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground">Settings</div>
          </>
        )}
        {(() => {
          if (role === "admin") {
            return (
              <>
                {isAllowed("/settings") && (
                <Link to="/settings" className={itemClass(pathname === "/settings")}> 
                  <Users className="h-4 w-4" />
                  {!collapsed && <span>User Management</span>}
                </Link>
                )}
                {isAllowed("/settings/dicom") && (
                <Link to="/settings/dicom" className={itemClass(pathname === "/settings/dicom")}>
                  <Server className="h-4 w-4" />
                  {!collapsed && <span>Dicom Storage</span>}
                </Link>
                )}
                {isAllowed("/settings/database") && (
                <Link to="/settings/database" className={itemClass(pathname === "/settings/database")}> 
                  <Database className="h-4 w-4" />
                  {!collapsed && <span>Database</span>}
                </Link>
                )}
                {isAllowed("/settings/idrl-national") && (
                <Link to="/settings/idrl-national" className={itemClass(pathname === "/settings/idrl-national")}> 
                  <Shield className="h-4 w-4" />
                  {!collapsed && <span>IDRL Nasional</span>}
                </Link>
                )}
              </>
            );
          }
          return null;
        })()}
      </nav>
      <div className="mt-4" />
    </aside>
  );
};

export default Sidebar;
