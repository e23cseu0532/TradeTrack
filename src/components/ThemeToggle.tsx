"use client"

import * as React from "react"
import { Moon, Sun, Check, Contrast } from "lucide-react"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

const themes = [
  { name: "Zinc", theme: "theme-zinc" },
  { name: "Slate", theme: "theme-slate" },
  { name: "Rose", theme: "theme-rose" },
  { name: "Indigo", theme: "theme-indigo" },
]

export function ThemeToggle() {
  const { setTheme, theme, resolvedTheme } = useTheme()
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const isDarkMode = resolvedTheme === 'dark';

  const toggleDarkMode = () => {
    setTheme(isDarkMode ? 'light' : 'dark');
  };

  const currentBaseTheme = themes.find(t => theme?.includes(t.theme))?.theme || 'theme-zinc';


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
        {themes.map((themeOption) => (
          <DropdownMenuItem key={themeOption.theme} onClick={() => setTheme(themeOption.theme)}>
            <div className="flex items-center gap-2">
               <div
                className="h-4 w-4 rounded-full border"
                style={{
                  backgroundColor: `hsl(var(--${themeOption.theme.replace('theme-','')}-primary))`,
                }}
              />
              <span>{themeOption.name}</span>
            </div>
             {currentBaseTheme === themeOption.theme && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <div 
            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
            onClick={(e) => e.preventDefault()}
        >
            <Label htmlFor="dark-mode-toggle" className="flex items-center gap-2 font-normal">
                <Contrast className="h-4 w-4" />
                Dark Mode
            </Label>
            {isMounted && <Switch 
                id="dark-mode-toggle" 
                className="ml-auto"
                checked={isDarkMode}
                onCheckedChange={toggleDarkMode}
            />}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
