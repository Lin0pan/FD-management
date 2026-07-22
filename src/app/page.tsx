import Link from "next/link";
import { de } from "@/i18n/de";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-3xl font-semibold">{de.home.heading}</h1>
      <p className="max-w-prose text-balance text-foreground/70">{de.home.subheading}</p>
      <Link href="/einstellungen" className="underline underline-offset-4">
        {de.home.settingsLink}
      </Link>
    </main>
  );
}
