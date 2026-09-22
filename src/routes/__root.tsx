import {
  dehydrate,
  HydrationBoundary,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { installGoAugmenter } from "@/lib/track";
import { getSiteSettings } from "@/lib/settings.public.functions";
import { SITE_SETTINGS_KEY } from "@/hooks/use-site-settings";
import { useEffect, type ReactNode } from "react";
import { useLogoUrl } from "@/hooks/use-logo-url";
import { DEFAULT_LOGO_URL } from "@/lib/brand";

import appCss from "../styles.css?url";
import { LanguageProvider } from "../lib/i18n/LanguageProvider";
import { PosthogAnalytics } from "../lib/posthog-analytics";
import "../lib/i18n";
import "../lib/stale-build-recovery";

/** Also used by routes that must look exactly like "not found" while a feature is switched off
 * (e.g. /disclosure before an admin activates it), so an inactive feature is indistinguishable
 * from a URL that never existed. */
export function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Pure Table — Gluten-Free Directory in Saudi Arabia" },
      {
        name: "description",
        content:
          "Discover trusted restaurants, cafes, bakeries, and home businesses offering safe gluten-free options across Saudi Arabia.",
      },
      { name: "author", content: "Pure Table" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:title", content: "Pure Table — Gluten-Free Directory in Saudi Arabia" },
      { name: "twitter:title", content: "Pure Table — Gluten-Free Directory in Saudi Arabia" },
      {
        property: "og:description",
        content:
          "Discover trusted restaurants, cafes, bakeries, and home businesses offering safe gluten-free options across Saudi Arabia.",
      },
      {
        name: "twitter:description",
        content:
          "Discover trusted restaurants, cafes, bakeries, and home businesses offering safe gluten-free options across Saudi Arabia.",
      },
      { property: "og:image", content: "/og-pure-table.jpg" },
      { name: "twitter:image", content: "/og-pure-table.jpg" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: DEFAULT_LOGO_URL, type: "image/png" },
      { rel: "apple-touch-icon", href: DEFAULT_LOGO_URL },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  // The admin's saved texts are loaded before the first paint, so visitors
  // never see the built-in placeholder copy flash first.
  loader: async ({ context }) => {
    try {
      await context.queryClient.ensureQueryData({
        queryKey: [...SITE_SETTINGS_KEY, "live"],
        queryFn: () => getSiteSettings(),
        staleTime: 60_000,
      });
    } catch {
      /* the site still renders with the built-in copy */
    }
    return { dehydratedState: dehydrate(context.queryClient) };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { dehydratedState } = Route.useLoaderData();

  // Outbound /go links get the anonymous visitor/session ids at click time.
  useEffect(() => installGoAugmenter(), []);

  // Stale-deploy recovery (chunk errors + hydration mismatch) is installed at
  // module scope in "@/lib/stale-build-recovery".

  return (
    <QueryClientProvider client={queryClient}>
      <HydrationBoundary state={dehydratedState}>
        <LanguageProvider>
          <BrandingEffects />
          <PosthogAnalytics />
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
        </LanguageProvider>
      </HydrationBoundary>
    </QueryClientProvider>
  );
}

/** Keeps browser icons on the exact same saved image used by every LogoMark. */
function BrandingEffects() {
  const logoUrl = useLogoUrl();

  useEffect(() => {
    for (const link of document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
    )) {
      link.href = logoUrl;
    }
  }, [logoUrl]);

  return null;
}
