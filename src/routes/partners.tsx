import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * The public "Join Us" form was retired in favour of the Business Owner Portal.
 * Old links and bookmarks are sent to the portal with a permanent redirect.
 */
export const Route = createFileRoute("/partners")({
  beforeLoad: () => {
    throw redirect({ to: "/portal", statusCode: 308 });
  },
});
