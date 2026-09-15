import { useLocation } from "react-router-dom";
import SEO from "./SEO";
import { resolveRouteMeta } from "./route-meta";

/**
 * Drives per-page <title>/meta from a single route→meta table.
 *
 * Rendered once inside <BrowserRouter>, it re-resolves on every navigation so
 * each route gets its own title, description, canonical and index/noindex
 * directive without every page having to declare its own <SEO>.
 */
const RouteSEO = () => {
  const { pathname } = useLocation();
  const meta = resolveRouteMeta(pathname);

  return (
    <SEO
      title={meta.title}
      description={meta.description}
      path={pathname}
      noIndex={meta.noIndex}
    />
  );
};

export default RouteSEO;
