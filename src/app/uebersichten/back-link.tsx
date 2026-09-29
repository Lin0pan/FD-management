import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { de } from "@/i18n/de";

/**
 * The way from a list back to its tab (US-38.3), beside the list's heading. Named after the tab, so
 * the tab that is marked and the way out say the same word.
 */
export function BackToOverviews({ testId }: { testId: string }): React.ReactElement {
  return (
    <Button variant="ghost" asChild>
      <Link href="/uebersichten" data-testid={testId}>
        <ArrowLeft aria-hidden="true" />
        {de.nav.overviews}
      </Link>
    </Button>
  );
}
