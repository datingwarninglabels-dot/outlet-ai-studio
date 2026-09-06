export type NavGroup = "Create" | "Library" | "Account";

export type NavItem = {
  label: string;
  href: string;
  group: NavGroup;
  /** Every item below is a real, working route. Kept for the nav's "Soon"
   * badge in case a future section ships behind it again. */
  status: "live" | "planned";
  /** Hidden from the nav for anyone but the platform-operator Owner — the
   * actual access control lives server-side (auth.config.ts's authorized
   * callback + the page's own role check), this just keeps the link from
   * being offered to a Customer who can't use it. */
  ownerOnly?: boolean;
};

export const NAV_GROUP_ORDER: NavGroup[] = ["Create", "Library", "Account"];

// Voice Studio and Thumbnail Studio are intentionally absent: thumbnails
// are generated from within a project (not a standalone hub yet) and a
// standalone voice tool doesn't exist. Their routes still resolve to an
// honest "not built yet" page so old links don't 404 — they're just not
// offered in the nav.
export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", group: "Create", status: "live" },
  { label: "Create Video", href: "/create-video", group: "Create", status: "live" },
  { label: "Projects", href: "/projects", group: "Create", status: "live" },
  { label: "Characters", href: "/characters", group: "Library", status: "live" },
  { label: "Worlds", href: "/worlds", group: "Library", status: "live" },
  { label: "Media", href: "/media-library", group: "Library", status: "live" },
  { label: "Brand Kit", href: "/brand-kit", group: "Library", status: "live" },
  { label: "Plans", href: "/pricing", group: "Account", status: "live" },
  { label: "Billing", href: "/billing", group: "Account", status: "live" },
  { label: "Provider Hub", href: "/provider-hub", group: "Account", status: "live", ownerOnly: true },
  { label: "Settings", href: "/settings", group: "Account", status: "live" },
];
