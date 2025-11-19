import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LayoutList, FileSpreadsheet, ActivitySquare, BarChart3 } from "lucide-react";

const Sidebar = () => {
  const { pathname } = useLocation();
  const itemClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
      active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
    );

  return (
    <aside className="fixed left-0 top-0 z-20 h-screen w-60 border-r border-border bg-card p-4">
      <div className="mb-6 flex items-center gap-2 px-2">
        <ActivitySquare className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold text-foreground">Dose Manager</span>
      </div>
      <nav className="space-y-1">
        <Link to="/dashboard" className={itemClass(pathname === "/dashboard")}>
          <BarChart3 className="h-4 w-4" />
          <span>Dashboard</span>
        </Link>
        <Link to="/worklist" className={itemClass(pathname === "/worklist")}> 
          <LayoutList className="h-4 w-4" />
          <span>Patient Dose List</span>
        </Link>
        <Link to="/reporting" className={itemClass(pathname === "/reporting")}>
          <FileSpreadsheet className="h-4 w-4" />
          <span>Saved Dose Data</span>
        </Link>
      </nav>
    </aside>
  );
};

export default Sidebar;