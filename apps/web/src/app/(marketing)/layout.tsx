import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site-config";
import { MarketingFooter } from "./marketing-footer";
import { MarketingHeader } from "./marketing-header";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-brand="marketing" className="flex min-h-full flex-1 flex-col bg-background text-foreground">
      <MarketingHeader />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </div>
  );
}
