"use client";

import { motion } from "motion/react";
import * as React from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export function ComponentPreviewTabs({
  className,
  align = "center",
  component,
  source,
  withOrnament = false,
}: React.ComponentProps<"div"> & {
  align?: "center" | "start" | "end";
  component: React.ReactNode;
  source: React.ReactNode;
  withOrnament?: boolean;
}) {
  const [tab, setTab] = React.useState("preview");

  return (
    <div className={cn("group relative flex flex-col gap-2", className)}>
      <Tabs className="relative pl-6" onValueChange={setTab} value={tab}>
        <TabsList className="grid grid-cols-2">
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="relative rounded bg-background">
        {withOrnament && (
          <>
            {/* left */}
            <motion.div
              animate={{ scaleY: 1 }}
              className="-top-10 -bottom-10 pointer-events-none absolute left-0 w-[1px] bg-primary"
              initial={{ scaleY: 0 }}
              style={{ originY: 0.5 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            />
            <motion.div
              animate={{ scaleY: 1 }}
              className="-top-6 -bottom-6 pointer-events-none absolute left-4 z-[-1] w-[1px] bg-primary"
              initial={{ scaleY: 0 }}
              style={{ originY: 0.5 }}
              transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
            />

            <motion.div
              animate={{ scaleY: 1 }}
              className="-top-[25vh] pointer-events-none absolute left-0 h-[100vh] w-[1px] border-primary/10 border-l border-dashed"
              initial={{ scaleY: 0 }}
              style={{ originY: 0.5 }}
              transition={{ duration: 1.2, delay: 0.6, ease: "easeOut" }}
            />
            <motion.div
              animate={{ scaleY: 1 }}
              className="-top-[25vh] pointer-events-none absolute left-4 h-[100vh] w-[1px] border-primary/10 border-l border-dashed"
              initial={{ scaleY: 0 }}
              style={{ originY: 0.5 }}
              transition={{ duration: 1.2, delay: 0.8, ease: "easeOut" }}
            />

            {/* right */}
            <motion.div
              animate={{ scaleY: 1 }}
              className="-top-10 -bottom-10 pointer-events-none absolute right-0 w-[1px] bg-primary"
              initial={{ scaleY: 0 }}
              style={{ originY: 0.5 }}
              transition={{ duration: 0.8, delay: 0, ease: "easeOut" }}
            />
            <motion.div
              animate={{ scaleY: 1 }}
              className="-top-6 -bottom-6 pointer-events-none absolute right-4 z-[-1] w-[1px] bg-primary"
              initial={{ scaleY: 0 }}
              style={{ originY: 0.5 }}
              transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            />

            <motion.div
              animate={{ scaleY: 1 }}
              className="-top-[25vh] pointer-events-none absolute right-0 h-[100vh] w-[1px] border-primary/10 border-r border-dashed"
              initial={{ scaleY: 0 }}
              style={{ originY: 0.5 }}
              transition={{ duration: 1.2, delay: 0.8, ease: "easeOut" }}
            />
            <motion.div
              animate={{ scaleY: 1 }}
              className="-top-[25vh] pointer-events-none absolute right-4 h-[100vh] w-[1px] border-primary/10 border-r border-dashed"
              initial={{ scaleY: 0 }}
              style={{ originY: 0.5 }}
              transition={{ duration: 1.2, delay: 0.6, ease: "easeOut" }}
            />

            {/* top */}
            <motion.div
              animate={{ scaleX: 1 }}
              className="-left-6 -right-6 pointer-events-none absolute top-0 h-[1px] bg-primary"
              initial={{ scaleX: 0 }}
              style={{ originX: 0.5 }}
              transition={{ duration: 0.8, delay: 0.8, ease: "easeOut" }}
            />
            <motion.div
              animate={{ scaleX: 1 }}
              className="-left-6 -right-6 pointer-events-none absolute top-4 z-[-1] h-[1px] bg-primary"
              initial={{ scaleX: 0 }}
              style={{ originX: 0.5 }}
              transition={{ duration: 0.8, delay: 1, ease: "easeOut" }}
            />

            <motion.div
              animate={{ scaleX: 1 }}
              className="-left-[100vw] -right-6 pointer-events-none absolute top-0 h-[1px] w-[300vw] border-primary/10 border-t border-dashed"
              initial={{ scaleX: 0 }}
              style={{ originX: 0.5 }}
              transition={{ duration: 1.5, delay: 1.2, ease: "easeOut" }}
            />
            <motion.div
              animate={{ scaleX: 1 }}
              className="-left-[100vw] -right-6 pointer-events-none absolute top-4 h-[1px] w-[300vw] border-primary/10 border-t border-dashed"
              initial={{ scaleX: 0 }}
              style={{ originX: 0.5 }}
              transition={{ duration: 1.5, delay: 1.4, ease: "easeOut" }}
            />

            {/* bottom */}
            <motion.div
              animate={{ scaleX: 1 }}
              className="-left-6 -right-6 pointer-events-none absolute bottom-0 h-[1px] bg-primary"
              initial={{ scaleX: 0 }}
              style={{ originX: 0.5 }}
              transition={{ duration: 0.8, delay: 1.6, ease: "easeOut" }}
            />
            <motion.div
              animate={{ scaleX: 1 }}
              className="-left-6 -right-6 pointer-events-none absolute bottom-4 z-[-1] h-[1px] bg-primary"
              initial={{ scaleX: 0 }}
              style={{ originX: 0.5 }}
              transition={{ duration: 0.8, delay: 1.8, ease: "easeOut" }}
            />

            <motion.div
              animate={{ scaleX: 1 }}
              className="-left-[100vw] -right-6 pointer-events-none absolute bottom-0 h-[1px] w-[300vw] border-primary/10 border-b border-dashed"
              initial={{ scaleX: 0 }}
              style={{ originX: 0.5 }}
              transition={{ duration: 1.5, delay: 0.2, ease: "easeOut" }}
            />
            <motion.div
              animate={{ scaleX: 1 }}
              className="-left-[100vw] -right-6 pointer-events-none absolute bottom-4 h-[1px] w-[300vw] border-primary/10 border-b border-dashed"
              initial={{ scaleX: 0 }}
              style={{ originX: 0.5 }}
              transition={{ duration: 1.5, delay: 0.8, ease: "easeOut" }}
            />
          </>
        )}
        {tab === "preview" && (
          <div
            className={cn(
              "flex aspect-video h-[450px] w-full justify-center p-10",
              align === "start" && "items-start",
              align === "center" && "items-center",
              align === "end" && "items-end"
            )}
          >
            {component}
          </div>
        )}
        {tab === "code" && (
          <div className="aspect-video h-[450px] overflow-auto px-5 py-4">
            {source}
          </div>
        )}
      </div>
    </div>
  );
}
