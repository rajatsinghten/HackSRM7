/**
 * AppNav — shared top navigation bar used on every page.
 *
 * Layout:  [left slot]   TokenTrim (centred)   [right slot]
 *
 * Props:
 *  left   – content for the left column (back button, etc.)
 *  right  – content for the right column (links, hints, etc.)
 *  fixed  – true for the landing page (position: fixed); false for inner pages
 */

interface AppNavProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  fixed?: boolean;
}

export default function AppNav({ left, right, fixed = false }: AppNavProps) {
  return (
    <nav className={`app-nav${fixed ? " app-nav--fixed" : ""}`}>
      <div className="app-nav-slot app-nav-slot--left">{left}</div>
      <span className="app-nav-brand">TokenTrim</span>
      <div className="app-nav-slot app-nav-slot--right">{right}</div>
    </nav>
  );
}
