import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-shimmer rounded-md bg-[linear-gradient(110deg,#F0F0F0,45%,#E0E0E0,55%,#F0F0F0)] dark:bg-[linear-gradient(110deg,hsl(var(--secondary)),45%,hsl(var(--border)),55%,hsl(var(--secondary)))] bg-[length:200%_100%]", className)}
      {...props}
    />
  )
}

export { Skeleton }
