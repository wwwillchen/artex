"use client";

import { Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import { THEME_MODE_OPTIONS, type ThemeMode } from "@/lib/preferences/theme";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

export function ThemeSwitcher() {
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);

  const changeTheme = (value: string) => {
    if (!THEME_MODE_OPTIONS.some((option) => option.value === value)) return;
    const mode = value as ThemeMode;
    setThemeMode(mode);
    void persistPreference("theme_mode", mode);
  };
  const label = THEME_MODE_OPTIONS.find((option) => option.value === themeMode)?.label ?? "System";
  const Icon = themeMode === "system" ? Monitor : themeMode === "dark" ? Moon : Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Appearance: ${label}`} title={`Appearance: ${label}`}>
          <Icon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuRadioGroup value={themeMode} onValueChange={changeTheme}>
          {THEME_MODE_OPTIONS.map((option) => {
            const ModeIcon = option.value === "system" ? Monitor : option.value === "dark" ? Moon : Sun;
            return (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <ModeIcon className="size-4 text-muted-foreground" />
                {option.label}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
