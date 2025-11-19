import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const TopNav = () => {
  const { pathname } = useLocation();
  const linkClass = (active: boolean) =>
    cn(
      "px-4 py-2 rounded-md text-sm font-medium",
      active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"
    );

  return (
    <nav className="mb-4 flex items-center gap-2">
      <Link to="/worklist" className={linkClass(pathname === "/worklist")}>Patient Dose List</Link>
      <Link to="/reporting" className={linkClass(pathname === "/reporting")}>Saved Dose Data</Link>
    </nav>
  );
};

export default TopNav;