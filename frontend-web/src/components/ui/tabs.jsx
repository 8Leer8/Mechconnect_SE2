import * as React from "react"
import { cn } from "@/lib/utils"

const TabsContext = React.createContext(null)

const useTabs = () => {
  const context = React.useContext(TabsContext)
  if (!context) {
    throw new Error("Tabs components must be used within Tabs")
  }
  return context
}

const Tabs = ({ value, onValueChange, children, className }) => {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn("w-full", className)}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

const TabsList = React.forwardRef(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  >
    {children}
  </div>
))
TabsList.displayName = "TabsList"

const TabsTrigger = React.forwardRef(({ className, value: triggerValue, children, ...props }, ref) => {
  const { value, onValueChange } = useTabs()
  const isActive = value === triggerValue
  return (
    <button
      ref={ref}
      onClick={() => onValueChange?.(triggerValue)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        isActive
          ? "bg-background text-foreground shadow-sm"
          : "hover:bg-background/50 hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
})
TabsTrigger.displayName = "TabsTrigger"

const TabsContent = React.forwardRef(({ className, value: contentValue, children, ...props }, ref) => {
  const { value } = useTabs()
  if (value !== contentValue) return null
  return (
    <div
      ref={ref}
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
})
TabsContent.displayName = "TabsContent"

export { Tabs, TabsList, TabsTrigger, TabsContent }
