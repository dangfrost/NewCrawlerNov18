import { Link, useLocation } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Database, Activity, Zap } from "lucide-react";

export default function Layout({ children }) {
  const location = useLocation();
  
  const navigationItems = [
    {
      title: "Instances",
      url: createPageUrl("Dashboard"),
      icon: Database,
    },
    {
      title: "Jobs",
      url: createPageUrl("Jobs"),
      icon: Activity,
    },
  ];

  return (
    <div className="min-h-screen flex w-full bg-gradient-to-br from-slate-50 to-blue-50/30">
      <div className="w-64 bg-white/70 backdrop-blur-sm border-r border-slate-200/50 p-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-slate-900 text-lg">ZillizAI</h2>
            <p className="text-xs text-slate-500 font-medium">powered by NeonDB</p>
          </div>
        </div>
        
        <nav className="space-y-2">
          {navigationItems.map((item) => {
            const isDashboard = item.title === "Instances";
            const isActive = isDashboard
              ? location.pathname === item.url || location.pathname === "/"
              : location.pathname === item.url;
            
            return (
              <Link
                key={item.title}
                to={item.url}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-all duration-200 ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 shadow-sm' 
                    : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}