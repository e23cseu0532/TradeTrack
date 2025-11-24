"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { PanelLeft, PanelRight } from "lucide-react"

import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const SIDEBAR_COOKIE_NAME = "sidebar-state"
const SIDEBAR_DEFAULT_STATE = "collapsed"

type SidebarContextValue = {
  state: "expanded" | "collapsed"
  isMobile: boolean
  toggle: () => void
  open: boolean
  setOpen: (open: boolean) => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider")
  }
  return context
}

function SidebarProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile()
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState<"expanded" | "collapsed">(SIDEBAR_DEFAULT_STATE);

  React.useEffect(() => {
    if (isMobile) {
      setOpen(false)
    }
  }, [isMobile]);

  React.useEffect(() => {
    const storedState = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${SIDEBAR_COOKIE_NAME}=`))
      ?.split("=")[1]
    if (storedState && (storedState === "expanded" || storedState === "collapsed")) {
      setState(storedState)
    }
  }, [])
  
  const toggle = React.useCallback(() => {
    if (isMobile) {
      setOpen((prev) => !prev)
    } else {
      setState((prev) => {
        const newState = prev === "expanded" ? "collapsed" : "expanded"
        document.cookie = `${SIDEBAR_COOKIE_NAME}=${newState}; path=/; max-age=${60 * 60 * 24 * 7}`
        return newState
      })
    }
  }, [isMobile])

  const value = React.useMemo(
    () => ({
      state,
      isMobile,
      toggle,
      open,
      setOpen,
    }),
    [state, isMobile, toggle, open, setOpen]
  )

  return (
    <SidebarContext.Provider value={value}>
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </SidebarContext.Provider>
  )
}

const sidebarVariants = cva(
  "group fixed inset-y-0 z-50 flex h-full flex-col bg-card transition-all duration-300 ease-in-out",
  {
    variants: {
      state: {
        expanded: "w-64",
        collapsed: "w-14",
      },
    },
    defaultVariants: {
      state: "expanded",
    },
  }
)

const Sidebar = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
  const { state, isMobile, open, setOpen } = useSidebar()

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="w-64 bg-card p-0 [&>button]:hidden"
        >
          <div ref={ref} className={cn("flex h-full flex-col", className)} {...props} />
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <aside
      ref={ref}
      className={cn(sidebarVariants({ state }), "border-r", className)}
      data-state={state}
      {...props}
    />
  )
})
Sidebar.displayName = "Sidebar"

const SidebarTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => {
  const { toggle, state } = useSidebar()
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      className={cn("h-8 w-8", className)}
      onClick={toggle}
      {...props}
    >
      {state === "expanded" ? <PanelLeft className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
      <span className="sr-only">Toggle Sidebar</span>
    </Button>
  )
})
SidebarTrigger.displayName = "SidebarTrigger"

const SidebarHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex h-14 items-center p-3", className)}
    {...props}
  />
))
SidebarHeader.displayName = "SidebarHeader"

const SidebarContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex-1 overflow-y-auto p-2", className)}
    {...props}
  />
))
SidebarContent.displayName = "SidebarContent"

const SidebarFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("mt-auto p-2", className)}
    {...props}
  />
))
SidebarFooter.displayName = "SidebarFooter"

const SidebarMenu = React.forwardRef<
  HTMLUListElement,
  React.HTMLAttributes<HTMLUListElement>
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn("flex flex-col gap-1", className)}
    {...props}
  />
))
SidebarMenu.displayName = "SidebarMenu"

const SidebarMenuItem = React.forwardRef<
  HTMLLIElement,
  React.HTMLAttributes<HTMLLIElement>
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn("group/item", className)} {...props} />
))
SidebarMenuItem.displayName = "SidebarMenuItem"

const menuButtonVariants = cva(
  "flex w-full items-center gap-3 overflow-hidden rounded-md p-2 text-left text-sm font-medium text-muted-foreground outline-none ring-ring transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 active:bg-accent",
  {
    variants: {
      isActive: {
        true: "bg-accent text-accent-foreground",
      },
    },
  }
)

const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    asChild?: boolean
    isActive?: boolean
  }
>(({ className, asChild, isActive, children, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  const { state, isMobile } = useSidebar()
  const isCollapsed = state === 'collapsed' && !isMobile

  const buttonContent = (
    <Comp
        ref={ref}
        className={cn(menuButtonVariants({ isActive }), className)}
        {...props}
      >
        {children}
    </Comp>
  )

  const tooltipContent = React.Children.map(children, (child) => {
    if (React.isValidElement(child) && child.type === 'span') return child.props.children
    return null
  })

  if (isCollapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {buttonContent}
        </TooltipTrigger>
        <TooltipContent side="right">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    );
  }

  return buttonContent
})
SidebarMenuButton.displayName = "SidebarMenuButton"


const SidebarInset = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => {
    const { state, isMobile } = useSidebar()
    
    if (isMobile) {
        return <div ref={ref} className={cn("flex flex-col", className)} {...props} />
    }

    return (
        <div 
            ref={ref} 
            className={cn(
                "flex flex-col transition-[margin-left] duration-300 ease-in-out", 
                state === 'expanded' ? 'ml-64' : 'ml-14',
                className
            )}
            {...props} 
        />
    )
})
SidebarInset.displayName = "SidebarInset"

export {
  SidebarProvider,
  useSidebar,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarInset,
}
