import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Explicitly register v4 theme variables to ensure tailwind-merge resolves conflicts correctly
const customTwMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-family': [{ font: ['sans', 'mono', 'serif'] }],
      'bg-color': [{ bg: ['background', 'foreground', 'primary', 'card', 'popover', 'secondary', 'muted', 'accent', 'destructive', 'border', 'input', 'ring'] }],
      'text-color': [{ text: ['background', 'foreground', 'primary', 'card', 'popover', 'secondary', 'muted', 'accent', 'destructive', 'primary-foreground', 'secondary-foreground', 'muted-foreground', 'accent-foreground', 'destructive-foreground', 'card-foreground', 'popover-foreground'] }],
      'border-color': [{ border: ['border', 'input', 'ring', 'primary', 'secondary', 'muted', 'accent', 'destructive', 'background', 'foreground'] }],
    }
  }
})

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs))
}
