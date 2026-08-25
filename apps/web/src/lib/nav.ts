export type NavItem = {
  label: string;
  href: string;
  /** M0 ships only the shell — every section below is a real route with an
   * honest "not built yet" state until its milestone lands. */
  status: "live" | "planned";
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", status: "live" },
  { label: "Create Video", href: "/create-video", status: "live" },
  { label: "Projects", href: "/projects", status: "live" },
  { label: "Character Library", href: "/characters", status: "live" },
  { label: "World Library", href: "/worlds", status: "live" },
  { label: "Voice Studio", href: "/voice-studio", status: "planned" },
  { label: "Thumbnail Studio", href: "/thumbnail-studio", status: "planned" },
  { label: "Media Library", href: "/media-library", status: "planned" },
  { label: "Brand Kit", href: "/brand-kit", status: "live" },
  { label: "Provider Hub", href: "/provider-hub", status: "live" },
  { label: "Settings", href: "/settings", status: "live" },
];
