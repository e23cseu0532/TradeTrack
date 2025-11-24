"use client"

import {
  BarChart2,
  Calculator,
  Coins,
  Home,
  Newspaper,
  BookOpen,
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
} from "@/components/ui/sidebar"
import { ThemeToggle } from "./ThemeToggle"
import Link from "next/link"
import { usePathname } from "next/navigation"

export function AppSidebar() {
  const { state } = useSidebar()
  const pathname = usePathname()

  const isActive = (path: string) => {
    // Special case for stop-loss report to highlight the parent "Watchlist"
    if (path === "/reports" && pathname.startsWith("/reports")) {
      return true;
    }
    return pathname === path
  }

  return (
    <Sidebar name="app-sidebar">
      <SidebarHeader>
        <div className="flex items-center gap-2">
            <Coins className="text-primary size-8" />
            <div className="text-2xl font-headline font-bold text-primary uppercase tracking-wider group-data-[collapsible=icon]:hidden">
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
                <span>Home</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/reports")}>
                <Link href="/reports">
                    <BarChart2 />
                    <span>Watchlist</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/calculators")}>
                <Link href="/calculators">
                    <Calculator />
                    <span>Calculators</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
           <SidebarMenuItem>
            <SidebarMenuButton asChild isActive={isActive("/reports/stop-loss")}>
                <Link href="/reports/stop-loss">
                    <Newspaper />
                    <span>Stop-Loss Report</span>
                </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  )
}
