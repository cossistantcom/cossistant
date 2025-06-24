"use client";

import { Logo } from "@/components/ui/logo";
import { DISCORD_INVITE, GITHUB_URL } from "@/constants";

export function TopBar() {
  return (
    <div className="fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center space-x-2">
            <Logo className="size-6" />
            <span className="text-base font-mono font-medium text-foreground">
              cossistant
            </span>
          </div>

          {/* Navigation */}
          <div className="hidden md:flex items-center space-x-8">
            {/* <a
              href="#docs"
              className="text-sm font-mono text-foreground/70 hover:text-foreground transition-colors"
            >
              docs
            </a> */}
            <a
              href={GITHUB_URL}
              className="text-sm font-mono text-foreground/70 hover:text-foreground transition-colors"
            >
              github
            </a>
            <a
              href={DISCORD_INVITE}
              className="text-sm font-mono text-foreground/70 hover:text-foreground transition-colors"
            >
              discord
            </a>
          </div>

          {/* Right side actions */}
          {/* {process.env.NODE_ENV === "development" && (
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              <SignInButtons />
            </div>
          )} */}
        </div>
      </div>
    </div>
  );
}
