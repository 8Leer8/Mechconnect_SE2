import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

const AccordionContext = React.createContext(null)
const AccordionItemContext = React.createContext(null)

const useAccordion = () => {
  const context = React.useContext(AccordionContext)
  if (!context) {
    throw new Error("Accordion components must be used within an Accordion")
  }
  return context
}

const useAccordionItem = () => {
  const context = React.useContext(AccordionItemContext)
  if (!context) {
    throw new Error("AccordionTrigger and AccordionContent must be used within AccordionItem")
  }
  return context
}

const Accordion = ({ type = "single", collapsible = false, value, onValueChange, children, className }) => {
  const [internalValue, setInternalValue] = React.useState(value || [])

  const isControlled = value !== undefined
  const currentValue = isControlled ? value : internalValue

  const handleValueChange = (itemValue) => {
    let newValue
    if (type === "single") {
      newValue = currentValue === itemValue && collapsible ? [] : itemValue
    } else {
      const values = Array.isArray(currentValue) ? currentValue : [currentValue].filter(Boolean)
      if (values.includes(itemValue)) {
        newValue = values.filter(v => v !== itemValue)
      } else {
        newValue = [...values, itemValue]
      }
    }

    if (!isControlled) {
      setInternalValue(newValue)
    }
    onValueChange?.(newValue)
  }

  return (
    <AccordionContext.Provider value={{ value: currentValue, onValueChange: handleValueChange, type }}>
      <div className={cn("w-full", className)}>
        {children}
      </div>
    </AccordionContext.Provider>
  )
}

const AccordionItem = React.forwardRef(({ className, value, children, ...props }, ref) => {
  return (
    <AccordionItemContext.Provider value={{ value }}>
      <div
        ref={ref}
        className={cn("border-b border-border", className)}
        {...props}
      >
        {children}
      </div>
    </AccordionItemContext.Provider>
  )
})
AccordionItem.displayName = "AccordionItem"

const AccordionTrigger = React.forwardRef(({ className, children, ...props }, ref) => {
  const { value: selectedValue, onValueChange, type } = useAccordion()
  const { value } = useAccordionItem()

  const isOpen = type === "single"
    ? selectedValue === value
    : Array.isArray(selectedValue) && selectedValue.includes(value)

  return (
    <button
      ref={ref}
      onClick={() => onValueChange(value)}
      className={cn(
        "flex flex-1 items-center justify-between py-4 font-medium transition-all hover:underline [&[data-state=open]>svg]:rotate-180",
        className
      )}
      data-state={isOpen ? "open" : "closed"}
      {...props}
    >
      <span className="flex-1 text-left">{children}</span>
      <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
    </button>
  )
})
AccordionTrigger.displayName = "AccordionTrigger"

const AccordionContent = React.forwardRef(({ className, children, ...props }, ref) => {
  const { value: selectedValue, type } = useAccordion()
  const { value } = useAccordionItem()

  const isOpen = type === "single"
    ? selectedValue === value
    : Array.isArray(selectedValue) && selectedValue.includes(value)

  if (!isOpen) return null

  return (
    <div
      ref={ref}
      className={cn("overflow-hidden text-sm transition-all", className)}
      data-state={isOpen ? "open" : "closed"}
      {...props}
    >
      <div className="pb-4 pt-0">{children}</div>
    </div>
  )
})
AccordionContent.displayName = "AccordionContent"

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
