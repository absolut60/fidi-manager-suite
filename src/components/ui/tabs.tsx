import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";

import { cn } from "@/lib/utils";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "flex w-full md:w-auto items-center justify-start md:justify-center gap-1 rounded-lg bg-muted p-1 text-muted-foreground overflow-x-auto flex-nowrap md:flex-wrap md:overflow-visible h-auto min-h-9 scrollbar-none [scroll-snap-type:x_proximity]",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const innerRef = React.useRef<HTMLButtonElement | null>(null);

  React.useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const scrollIfActive = () => {
      if (el.getAttribute("data-state") !== "active") return;
      const parent = el.parentElement;
      if (!parent || parent.scrollWidth <= parent.clientWidth) return;
      el.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
    };
    scrollIfActive();
    const obs = new MutationObserver(scrollIfActive);
    obs.observe(el, { attributes: true, attributeFilter: ["data-state"] });
    return () => obs.disconnect();
  }, []);

  return (
    <TabsPrimitive.Trigger
      ref={(node) => {
        innerRef.current = node;
        if (typeof ref === "function") ref(node);
        else if (ref) (ref as React.MutableRefObject<typeof node>).current = node;
      }}
      className={cn(
        "inline-flex shrink-0 [scroll-snap-align:start] items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow",
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;


const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
