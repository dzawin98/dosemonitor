import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const TopNav = () => {
  const { pathname } = useLocation();
  const linkClass = (active: boolean) =>
    cn(
      "px-4 py-2 rounded-md text-sm font-medium",
      active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"
    );

  const perms = (() => {
    try {
      const p = localStorage.getItem("auth_perms");
      return p ? JSON.parse(p) as string[] : [];
    } catch {
      return [];
    }
  })();
  const role = (() => { try { return (localStorage.getItem("auth_role") || "").toLowerCase(); } catch { return ""; } })();
  const isAllowed = (path: string) => {
    if (role === "admin") return true;
    if (!perms || perms.length === 0) return true;
    return perms.includes(path);
  };

  return (
    <nav className="mb-4 flex items-center gap-2">
      {isAllowed("/worklist") && (
        <Link to="/worklist" className={linkClass(pathname === "/worklist")}>
          Worklist
        </Link>
      )}
      {isAllowed("/reporting") && (
        <Link to="/reporting" className={linkClass(pathname === "/reporting")}>
          Reporting
        </Link>
      )}
    </nav>
  );
};

export default TopNav;
