import { NavLink, Outlet } from 'react-router-dom';

const navigation = [
  { to: '/', label: 'Home', end: true },
  { to: '/study', label: 'Study' },
  { to: '/review', label: 'Review' },
  { to: '/errors', label: 'Errors' },
  { to: '/settings', label: 'Settings' },
];

export function AppLayout() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">PTE Study App</p>
          <h1>Build your study habit.</h1>
        </div>
        <nav aria-label="Main navigation">
          {navigation.map(({ to, label, end }) => (
            <NavLink
              className={({ isActive }) => (isActive ? 'active' : undefined)}
              end={end}
              key={to}
              to={to}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="app-content">
        <Outlet />
      </main>
    </div>
  );
}
