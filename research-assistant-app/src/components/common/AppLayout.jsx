import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/useAuth';
import { cn } from '../../utils/helpers';

/**
 * Navigation items configuration
 */
const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: DashboardIcon },
  { name: 'Documents', href: '/documents', icon: DocumentsIcon },
  { name: 'Templates', href: '/templates', icon: TemplatesIcon },
];

/**
 * App Layout Component
 * Provides sidebar navigation, top bar, and main content area
 * 
 * @param {Object} props
 * @param {React.ReactNode} children - Page content
 * @param {boolean} fullWidth - Whether to use full width (no max-width container)
 */
export default function AppLayout({ children, fullWidth = false }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  // Handle sign out
  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-gray-600/75 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white transform transition-transform duration-300 ease-in-out lg:hidden',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          <Link to="/dashboard" className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-sky-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">R</span>
            </div>
            <span className="font-semibold text-gray-900">Research AI</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-md text-gray-500 hover:bg-gray-100"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>
        <SidebarContent
          navigation={navigation}
          currentPath={location.pathname}
          user={user}
          onSignOut={handleSignOut}
        />
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:flex lg:w-64 lg:flex-col">
        <div className="flex flex-col grow bg-white border-r border-gray-200">
          <div className="flex items-center h-16 px-4 border-b border-gray-200">
            <Link to="/dashboard" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-sky-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-lg">R</span>
              </div>
              <span className="font-semibold text-gray-900">Research AI</span>
            </Link>
          </div>
          <SidebarContent
            navigation={navigation}
            currentPath={location.pathname}
            user={user}
            onSignOut={handleSignOut}
          />
        </div>
      </div>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <div className="sticky top-0 z-30 flex items-center h-16 px-4 bg-white border-b border-gray-200 lg:px-8">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-md text-gray-500 hover:bg-gray-100 lg:hidden"
          >
            <MenuIcon className="w-6 h-6" />
          </button>

          <div className="flex-1" />

          {/* New Project Button */}
          <Link
            to="/projects/new"
            className="inline-flex items-center px-4 py-2 bg-sky-600 text-white font-medium rounded-lg hover:bg-sky-700 transition-colors"
          >
            <PlusIcon className="w-5 h-5 mr-2" />
            <span className="hidden sm:inline">New Project</span>
          </Link>
        </div>

        {/* Page content */}
        <main className={cn('py-8', fullWidth ? 'px-4' : 'px-4 lg:px-8')}>
          <div className={cn(fullWidth ? '' : 'max-w-7xl mx-auto')}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

/**
 * Sidebar Content Component
 */
function SidebarContent({ navigation, currentPath, user, onSignOut }) {
  return (
    <div className="flex flex-col grow pt-4 pb-4 overflow-y-auto">
      <nav className="flex-1 px-3 space-y-1">
        {navigation.map((item) => {
          const isActive = currentPath === item.href || currentPath.startsWith(item.href + '/');
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-sky-50 text-sky-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className="w-5 h-5" />
              <span className="ml-3">{item.name}</span>
            </Link>
          );
        })}
      </nav>

      {/* User section */}
      <div className="px-3 mt-6 pt-6 border-t border-gray-200">
        <div className="flex items-center px-3 py-2">
          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
            <UserIcon className="w-5 h-5 text-gray-500" />
          </div>
          <div className="ml-3 flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user?.email || 'User'}
            </p>
          </div>
        </div>
        <button
          onClick={onSignOut}
          className="flex items-center w-full px-3 py-2 mt-2 text-sm font-medium text-gray-600 rounded-lg hover:bg-gray-100 hover:text-gray-900 transition-colors"
        >
          <LogoutIcon className="w-5 h-5" />
          <span className="ml-3">Sign out</span>
        </button>
      </div>
    </div>
  );
}

// ==============================================
// ICONS
// ==============================================

function DashboardIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
    </svg>
  );
}

function DocumentsIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function TemplatesIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  );
}

function MenuIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function PlusIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}

function UserIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}

function LogoutIcon({ className }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}