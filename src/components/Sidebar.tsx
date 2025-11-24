import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { LayoutList, FileSpreadsheet, ActivitySquare, BarChart3, Shield, LogOut, Server } from "lucide-react";
import { Button } from "@/components/ui/button";

const Sidebar = () => {
  const { pathname } = useLocation();
  const itemClass = (active: boolean) =>
    cn(
      "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
      active ? "bg-primary text-primary-foreground" : "hover:bg-muted text-foreground"
    );

  return (
    <aside className="fixed left-0 top-0 z-20 h-screen w-60 border-r border-border bg-card p-4 flex flex-col">
      <div className="mb-6 flex items-center gap-2 px-2">
        <ActivitySquare className="h-6 w-6 text-primary" />
        <span className="text-lg font-bold text-foreground">Dose Manager</span>
      </div>
      <nav className="space-y-1 flex-1">
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
        {(() => {
          let role = "";
          try { role = (localStorage.getItem("auth_role") || "").toLowerCase(); } catch {}
          if (role === "admin") {
            return (
              <>
                <Link to="/settings" className={itemClass(pathname === "/settings")}>
                  <Shield className="h-4 w-4" />
                  <span>User Management</span>
                </Link>
                <Link to="/settings/dicom" className={itemClass(pathname === "/settings/dicom")}>
                  <Server className="h-4 w-4" />
                  <span>Setting Dicom Storage</span>
                </Link>
                <Link to="/settings/database" className={itemClass(pathname === "/settings/database")}>
                  <Server className="h-4 w-4" />
                  <span>Database</span>
                </Link>
              </>
            );
          }
          return null;
        })()}
      </nav>
      <div className="mt-4">
        <Button
          variant="outline"
          className="w-full justify-center gap-2"
          onClick={() => {
            try {
              localStorage.removeItem("auth_token");
              localStorage.removeItem("auth_username");
              localStorage.removeItem("auth_role");
            } catch {}
            window.location.href = "/login";
          }}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </aside>
  );
};

export default Sidebar;