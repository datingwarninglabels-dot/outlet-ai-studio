export type NavItem = {
  label: string;
  href: string;
  /** M0 ships only the shell — every section below is a real route with an
   * honest "not built yet" state until its milestone lands. */
  status: "live" | "planned";
  /** Hidden from the nav for anyone but the platform-operator Owner — the
   * actual access control lives server-side (auth.config.ts's authorized
   * callback + the page's own role check), this just keeps the link from
   * being offered to a Customer who can't use it. */
  ownerOnly?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", status: "live" },
  { label: "Create Video", href: "/create-video", status: "live" },
  { label: "Projects", href: "/projects", status: "live" },
  { label: "Character Library", href: "/characters", status: "live" },
  { label: "World Library", href: "/worlds", status: "live" },
  { label: "Voice Studio", href: "/voice-studio", status: "planned" },
  { label: "Thumbnail Studio", href: "/thumbnail-studio", status: "planned" },
  { label: "Media Library", href: "/media-library", status: "live" },
  { label: "Brand Kit", href: "/brand-kit", status: "live" },
  { label: "Pricing", href: "/pricing", status: "live" },
  { label: "Billing", href: "/billing", status: "live" },
  { label: "Provider Hub", href: "/provider-hub", status: "live", ownerOnly: true },
  { label: "Settings", href: "/settings", status: "live" },
];
