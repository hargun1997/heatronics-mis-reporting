import { NavLink } from 'react-router-dom';
import { ALL_CATEGORIES, CATEGORY_META } from '../../data/compliance/types';

/**
 * Sticky secondary nav for the Compliance Calendar — shows all 7 categories so
 * the user can jump between them without returning to the hub.
 */
export function CategoryTabs() {
  return (
    <div className="sticky top-14 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <nav className="flex overflow-x-auto gap-1 py-2 no-scrollbar">
          <NavLink
            to="/compliance"
            end
            className={({ isActive }) =>
              `px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                isActive
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`
            }
          >
            Overview
          </NavLink>
          {ALL_CATEGORIES.map((cat) => (
            <NavLink
              key={cat}
              to={`/compliance/${cat}`}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`
              }
            >
              {CATEGORY_META[cat].name}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
