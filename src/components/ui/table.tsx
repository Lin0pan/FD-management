import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Three deliberate departures from what `shadcn add table` writes, stated here because regenerating
 * the file would lose them.
 *
 * **No `"use client"`.** Nothing here is client-only, and the directive would push the register's 240
 * rows across a client boundary for nothing.
 *
 * **`containerClassName`.** The wrapper's `overflow-x-auto` is what makes a wide table scroll *and*
 * what stops a `sticky` header engaging with the page — when one axis is not `visible` the other
 * computes to `auto`, so the div becomes the scrollport. A screen wanting a sticky header has to turn
 * that off at the widths where the table fits.
 *
 * **`containerProps`.** `...props` goes to the `<table>`, so a screen bounding the container's height
 * has nowhere to put the `tabIndex`, `role` and `aria-label` that make the box keyboard-scrollable
 * (WCAG 2.1.1). Those must land on the element that actually scrolls.
 */
function Table({
  className,
  containerClassName,
  containerProps,
  ...props
}: React.ComponentProps<"table"> & {
  containerClassName?: string;
  containerProps?: React.ComponentProps<"div">;
}) {
  return (
    <div
      data-slot="table-container"
      {...containerProps}
      className={cn(
        "relative w-full overflow-x-auto",
        containerClassName,
        containerProps?.className,
      )}
    >
      <table
        data-slot="table"
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn("p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0", className)}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
