"use client"

import * as React from "react"
import { Moon, Sun, Check } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

const themes = [
  { name: "Zinc", theme: "theme-zinc" },
  { name: "Slate", theme: "theme-slate" },
  { name: "Rose", theme: "theme-rose" },
  { name: "Indigo", theme: "theme-indigo" },
]

export function ThemeToggle() {
  const { setTheme, theme: activeTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {themes.map((theme) => (
          <DropdownMenuItem key={theme.theme} onClick={() => setTheme(theme.theme)}>
            <div className="flex items-center gap-2">
               <div
                className={cn("h-4 w-4 rounded-full", theme.theme)}
                style={{
                  backgroundColor: `hsl(var(--primary))`,
                }}
              />
              <span>{theme.name}</span>
            </div>
             {activeTheme === theme.theme && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem onClick={() => setTheme(activeTheme?.includes('dark') ? 'light' : 'dark')}>
            Toggle Dark Mode
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
