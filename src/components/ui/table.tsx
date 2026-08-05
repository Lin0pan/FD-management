import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Three deliberate departures from what `shadcn add table` writes — all of which would be lost if
 * this file were ever regenerated, so they are stated here rather than left to be rediscovered.
 *
 * **No `"use client"`.** Nothing in this module is client-only: no hooks, no handlers, no browser
 * API. Upstream marks it so because that is how the whole set ships. Keeping the directive would
 * push the register's 240 rows across a client boundary for nothing. Removing it only widens where
 * the component may be used — a client component importing it still bundles it as before.
 *
 * **`containerClassName`.** The wrapper's `overflow-x-auto` is what makes a wide table scroll, and
 * it is also what stops a `sticky` header inside it from ever engaging with the page: when one axis
 * is not `visible` the other computes to `auto`, so the div becomes the scrollport the header
 * sticks to. A screen that wants a sticky header therefore has to be able to turn the container's
 * overflow off at the widths where the table fits (`overflow-x-auto lg:overflow-x-visible`).
 *
 * **`containerProps`.** The other side of the same coin: `...props` goes to the `<table>`, so a
 * screen that bounds the container's height — the customer record's hand-out history — has nowhere
 * to put the `tabIndex`, `role` and `aria-label` that make the box keyboard-scrollable (WCAG 2.1.1).
 * Those attributes have to land on the element that actually scrolls, and that is this div. Its
 * `className` is folded into the same `cn` as `containerClassName`, so passing one never silently
 * drops the other.
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
