
"use client"

import {
  Activity,
  BarChart2,
  Calculator,
  Coins,
  Home,
  Newspaper,
  BookOpen,
  PanelLeft,
  Shapes,
  Scaling,
  Zap,
  ShieldAlert,
  Bell
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
  useSidebar,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { ThemeToggle } from "./ThemeToggle"
import Link from "next/link"
import { usePathname } from "next/navigation"

export function AppSidebar() {
  const { state } = useSidebar()
  const pathname = usePathname()

  const isActive = (path: string) => {
    if (path === "/reports" && pathname === "/reports") return true;
    if (path === "/reports/pivot-scanner" && pathname === "/reports/pivot-scanner") return true;
    if (path === "/reports/price-monitor" && pathname === "/reports/price-monitor") return true;
    if (path === "/portfolio-explorer" && pathname.startsWith("/portfolio-explorer")) return true;
    if (path === "/position-sizing" && pathname.startsWith("/position-sizing")) return true;
    if (path === "/option-chain" && pathname.startsWith("/option-chain")) return true;
    if (path === "/analysis" && pathname.startsWith("/analysis")) return true;
    if (pathname.startsWith(path) && path !== "/") return true;
    return pathname === path
  }

  return (
    <>
    <SidebarHeader>
        <div className="flex items-center gap-2">
            <Coins className="text-primary size-8" />
            <div className="text-2xl font-headline font-bold text-primary uppercase tracking-wider group-data-[state=collapsed]:hidden">
                StockTracker
            </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/")}>
              <Link href="/">
                <Home />
                <span className="group-data-[state=collapsed]:hidden">Home</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/reports")}>
                <Link href="/reports">
                    <BarChart2 />
                    <span className="group-data-[state=collapsed]:hidden">Watchlist</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/reports/price-monitor")}>
                <Link href="/reports/price-monitor">
                    <Bell />
                    <span className="group-data-[state=collapsed]:hidden">Price Monitor</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/reports/pivot-scanner")}>
                <Link href="/reports/pivot-scanner">
                    <ShieldAlert />
                    <span className="group-data-[state=collapsed]:hidden">Pivot Scanner</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
           <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/option-chain")}>
                <Link href="/option-chain">
                    <Activity />
                    <span className="group-data-[state=collapsed]:hidden">Option Chain</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
           <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/portfolio-explorer")}>
                <Link href="/portfolio-explorer">
                    <Shapes />
                    <span className="group-data-[state=collapsed]:hidden">Explorer</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/calculators")}>
                <Link href="/calculators">
                    <Calculator />
                    <span className="group-data-[state=collapsed]:hidden">Calculators</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
           <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/reports/stop-loss")}>
                <Link href="/reports/stop-loss">
                    <Newspaper />
                    <span className="group-data-[state=collapsed]:hidden">Stop-Loss Report</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/position-sizing")}>
                <Link href="/position-sizing">
                    <Scaling />
                    <span className="group-data-[state=collapsed]:hidden">Position Sizing</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/analysis")}>
                <Link href="/analysis">
                    <Zap />
                    <span className="group-data-[state=collapsed]:hidden">AI Analysis</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="flex items-center gap-2">
         <SidebarTrigger />
         <div className="flex-1 group-data-[state=collapsed]:hidden"></div>
         <ThemeToggle />
      </SidebarFooter>
      </>
  )
}
