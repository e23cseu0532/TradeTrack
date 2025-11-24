"use client"

import {
  BarChart2,
  Calculator,
  Coins,
  Home,
  Newspaper,
  BookOpen,
  PanelLeft,
  Shapes
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
    // Special cases to highlight parent nav item
    if (path === "/reports" && pathname.startsWith("/reports")) {
      return true;
    }
     if (path === "/portfolio-explorer" && pathname.startsWith("/portfolio-explorer")) {
      return true;
    }
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
