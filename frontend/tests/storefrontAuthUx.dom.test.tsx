import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import Navbar from '../src/components/Navbar';
import AccountPage from '../src/app/account/page';
import { useAuthStore } from '../src/store/authStore';
import { useCartStore } from '../src/store/cartStore';

// Mock next/navigation
const pushMock = vi.fn();
const replaceMock = vi.fn();
let currentTab = 'profile';
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => ({
    get: (key: string) => (key === 'tab' ? currentTab : null),
  }),
}));

// Mock api
vi.mock('@/lib/api', () => ({
  getCategories: vi.fn().mockResolvedValue([
    { _id: 'cat-1', name: 'Nuts & Dry Fruits' },
    { _id: 'cat-2', name: 'Oils & Wellness' },
  ]),
}));

// Mock accountService
vi.mock('@/services/account.service', () => ({
  accountService: {
    profile: vi.fn().mockResolvedValue({
      profile: {
        id: 'user-admin',
        fullName: 'UAT Administrator',
        email: 'admin-uat@mevapur.test',
        phone: '+923001234567',
        residenceCountry: 'PK',
        isCountryComplete: true,
      },
    }),
    returns: vi.fn().mockResolvedValue({ returns: [] }),
    refunds: vi.fn().mockResolvedValue({ refunds: [] }),
    updateProfile: vi.fn().mockResolvedValue({ profile: {} }),
  },
  getAccountApiErrorMessage: vi.fn((err, fallback) => fallback),
}));

// Mock authSession
vi.mock('@/lib/authSession', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/authSession')>();
  return {
    ...actual,
    authService: {
      ...actual.authService,
      getSessions: vi.fn().mockResolvedValue([
        {
          id: 'session-curr-1',
          isCurrent: true,
          deviceInfo: { browser: 'Chrome', os: 'Windows', device: 'desktop' },
          ipAddress: '127.0.0.1',
          createdAt: new Date().toISOString(),
        },
      ]),
      revokeSession: vi.fn().mockResolvedValue({ revokedCurrent: true }),
      logoutAll: vi.fn().mockResolvedValue(undefined),
    },
    getSessionGeneration: vi.fn(() => 1),
    isCurrentSessionGeneration: vi.fn(() => true),
  };
});

describe('Storefront Auth UX: Header Customer Name & Dropdown Menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCartStore.setState({ items: [], wishlist: [] });
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isInitialized: true,
    });
  });

  it('1. Renders generic Sign In link when customer is unauthenticated', () => {
    render(<Navbar />);

    const signInLink = screen.getByLabelText(/sign in/i);
    expect(signInLink).toBeInTheDocument();
    expect(signInLink.getAttribute('href')).toBe('/login');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByText(/sign out/i)).not.toBeInTheDocument();
  });

  it('2. Dynamically displays customer name and avatar badge when authenticated as admin-uat', async () => {
    const logoutMock = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      user: {
        id: 'user-admin',
        fullName: 'UAT Administrator',
        email: 'admin-uat@mevapur.test',
        role: 'admin',
        isVerified: true,
      },
      token: 'jwt-token-123',
      isAuthenticated: true,
      isInitialized: true,
      logout: logoutMock,
    });

    render(<Navbar />);

    // Header displays first name or display name alongside avatar badge
    const userMenuButton = screen.getByRole('button', { name: /user menu for UAT Administrator/i });
    expect(userMenuButton).toBeInTheDocument();
    expect(userMenuButton).toHaveTextContent('UAT');
    expect(userMenuButton).toHaveTextContent('U'); // Avatar initial

    // Dropdown is initially closed
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // Click to open dropdown menu
    fireEvent.click(userMenuButton);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // Verify dropdown contents matching all 6 Account Dashboard tabs
    expect(screen.getByText('UAT Administrator')).toBeInTheDocument();
    expect(screen.getByText('admin-uat@mevapur.test')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();

    const profileLink = screen.getByRole('menuitem', { name: /personal profile/i });
    expect(profileLink).toBeInTheDocument();
    expect(profileLink.getAttribute('href')).toBe('/account?tab=profile');

    const addressBookLink = screen.getByRole('menuitem', { name: /address book/i });
    expect(addressBookLink).toBeInTheDocument();
    expect(addressBookLink.getAttribute('href')).toBe('/account?tab=addresses');

    const ordersLink = screen.getByRole('menuitem', { name: /orders & returns/i });
    expect(ordersLink).toBeInTheDocument();
    expect(ordersLink.getAttribute('href')).toBe('/account?tab=orders');

    const reviewsLink = screen.getByRole('menuitem', { name: /my reviews/i });
    expect(reviewsLink).toBeInTheDocument();
    expect(reviewsLink.getAttribute('href')).toBe('/account?tab=reviews');

    const securityLink = screen.getByRole('menuitem', { name: /security & sessions/i });
    expect(securityLink).toBeInTheDocument();
    expect(securityLink.getAttribute('href')).toBe('/account?tab=security');

    const notificationsLink = screen.getByRole('menuitem', { name: /notifications/i });
    expect(notificationsLink).toBeInTheDocument();
    expect(notificationsLink.getAttribute('href')).toBe('/account?tab=notifications');

    const logoutButton = screen.getByRole('menuitem', { name: /sign out/i });
    expect(logoutButton).toBeInTheDocument();
  });

  it('3. Closes dropdown menu when pressing Escape or clicking outside', () => {
    useAuthStore.setState({
      user: {
        id: 'user-admin',
        fullName: 'UAT Administrator',
        email: 'admin-uat@mevapur.test',
        role: 'admin',
        isVerified: true,
      },
      token: 'jwt-token-123',
      isAuthenticated: true,
      isInitialized: true,
    });

    render(<Navbar />);

    const userMenuButton = screen.getByRole('button', { name: /user menu for UAT Administrator/i });
    fireEvent.click(userMenuButton);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // Press Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    // Reopen and click outside
    fireEvent.click(userMenuButton);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('4. Executes clean logout from Header dropdown and redirects to login with confirmation message', async () => {
    const logoutMock = vi.fn().mockImplementation(async () => {
      useAuthStore.setState({
        user: null,
        token: null,
        isAuthenticated: false,
      });
    });

    useAuthStore.setState({
      user: {
        id: 'user-admin',
        fullName: 'UAT Administrator',
        email: 'admin-uat@mevapur.test',
        role: 'admin',
        isVerified: true,
      },
      token: 'jwt-token-123',
      isAuthenticated: true,
      isInitialized: true,
      logout: logoutMock,
    });

    const { rerender } = render(<Navbar />);

    const userMenuButton = screen.getByRole('button', { name: /user menu for UAT Administrator/i });
    fireEvent.click(userMenuButton);

    const logoutButton = screen.getByRole('menuitem', { name: /sign out/i });
    fireEvent.click(logoutButton);

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith('/login?message=Signed+out+successfully');
    });

    // Re-render to assert header state reverted
    rerender(<Navbar />);
    expect(screen.getByLabelText(/sign in/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /user menu/i })).not.toBeInTheDocument();
  });

  it('5. Re-login dynamically displays customer full/first name accurately', () => {
    useAuthStore.setState({
      user: {
        id: 'user-customer-2',
        fullName: 'Ahmad Sandhu',
        email: 'ahmadsandhu0207@gmail.com',
        role: 'customer',
        isVerified: true,
      },
      token: 'jwt-token-customer',
      isAuthenticated: true,
      isInitialized: true,
    });

    render(<Navbar />);

    const userMenuButton = screen.getByRole('button', { name: /user menu for Ahmad Sandhu/i });
    expect(userMenuButton).toBeInTheDocument();
    expect(userMenuButton).toHaveTextContent('Ahmad');
    expect(userMenuButton).toHaveTextContent('A'); // Initial

    fireEvent.click(userMenuButton);
    expect(screen.getByText('Ahmad Sandhu')).toBeInTheDocument();
    expect(screen.getByText('ahmadsandhu0207@gmail.com')).toBeInTheDocument();
  });

  it('6. Account Dashboard renders Continue Shopping and excludes duplicate Sign Out button', async () => {
    currentTab = 'profile';
    useAuthStore.setState({
      user: {
        id: 'user-admin',
        fullName: 'UAT Administrator',
        email: 'admin-uat@mevapur.test',
        role: 'admin',
        isVerified: true,
      },
      token: 'jwt-token-123',
      isAuthenticated: true,
      isInitialized: true,
    });

    render(<AccountPage />);

    // Wait for account content to load
    await waitFor(() => {
      expect(screen.getByText('UAT Administrator')).toBeInTheDocument();
    });

    // Check "Continue Shopping" button is present
    const continueShoppingLink = screen.getByRole('link', { name: /continue shopping/i });
    expect(continueShoppingLink).toBeInTheDocument();
    expect(continueShoppingLink.getAttribute('href')).toBe('/products');

    // Verify duplicate "Sign Out" button is absent from the banner
    expect(screen.queryByRole('button', { name: /^sign out$/i })).not.toBeInTheDocument();
  });

  it('7. Security & Sessions tab renders "Sign Out of this Device" button for current session', async () => {
    currentTab = 'security';
    const logoutMock = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      user: {
        id: 'user-admin',
        fullName: 'UAT Administrator',
        email: 'admin-uat@mevapur.test',
        role: 'admin',
        isVerified: true,
      },
      token: 'jwt-token-123',
      isAuthenticated: true,
      isInitialized: true,
      logout: logoutMock,
    });

    // Mock window.confirm
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    render(<AccountPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign out of this device/i })).toBeInTheDocument();
    });

    const signOutDeviceBtn = screen.getByRole('button', { name: /sign out of this device/i });
    fireEvent.click(signOutDeviceBtn);

    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalled();
      expect(pushMock).toHaveBeenCalledWith('/login?message=Signed+out+successfully');
    });
  });

  it('8. Orders & Returns tab renders restyled form with HZ-... placeholder', async () => {
    currentTab = 'orders';
    useAuthStore.setState({
      user: {
        id: 'user-customer',
        fullName: 'Muhammad Ahmad',
        email: 'ahmad@mevapur.test',
        role: 'customer',
        isVerified: true,
      },
      token: 'jwt-customer-token',
      isAuthenticated: true,
      isInitialized: true,
    });

    render(<AccountPage />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /request a return/i })).toBeInTheDocument();
    });

    const orderInput = screen.getByPlaceholderText(/HZ-YYYYMMDD-.../i);
    expect(orderInput).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /load order items/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit return request/i })).toBeInTheDocument();
  });

  it('9. Customer session persists across bootstrap via mevapur_storefront_auth in localStorage', async () => {
    const customerUser = {
      id: 'cust-123',
      fullName: 'Muhammad Ahmad',
      email: 'ahmad@mevapur.test',
      role: 'customer',
      isVerified: true,
    };

    // Store in localStorage under mevapur_storefront_auth
    window.localStorage.setItem('mevapur_storefront_auth', JSON.stringify({
      token: 'persisted-jwt-token',
      user: customerUser,
      csrfToken: 'csrf-token-abc',
      timestamp: Date.now(),
    }));

    // Reset store to uninitialized
    useAuthStore.setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isInitialized: false,
    });

    await useAuthStore.getState().bootstrap();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.fullName).toBe('Muhammad Ahmad');
    expect(state.user?.email).toBe('ahmad@mevapur.test');
    expect(state.token).toBe('persisted-jwt-token');
  });
});
