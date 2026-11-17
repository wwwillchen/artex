import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // field-sizing-content auto-grows the textarea to its content; cap the
        // growth (and scroll past it) so a large paste can't blow a dialog past the
        // viewport. Call sites can override via a max-h-* class (twMerge wins).
        "flex field-sizing-content max-h-[45vh] min-h-20 w-full overflow-auto rounded-md border border-input bg-card px-3 py-2.5 text-base leading-relaxed transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
