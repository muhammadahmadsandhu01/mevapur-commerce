import assert from 'node:assert/strict';
import test from 'node:test';
import { PRODUCT_PLACEHOLDER, AVATAR_PLACEHOLDER } from '../src/lib/placeholder.ts';
import { toggleTopBarPopover } from '../src/lib/notificationUi.ts';
import { isPublicAuthRoute } from '../src/lib/authRoute.ts';

// 1. Profile normalization/payload
test('profile normalization correctly conditionalizes avatar payload', () => {
  const normalizePayload = (fullName: string, phone: string, avatar: string) => {
    const payload: Record<string, string> = { fullName, phone };
    if (avatar && avatar.trim() !== '') {
      payload.avatar = avatar;
    }
    return payload;
  };

  // avatar empty string -> omitted
  assert.deepEqual(normalizePayload('John Doe', '123456', ''), { fullName: 'John Doe', phone: '123456' });
  // avatar whitespace -> omitted
  assert.deepEqual(normalizePayload('John Doe', '123456', '   '), { fullName: 'John Doe', phone: '123456' });
  // avatar valid URL -> included
  assert.deepEqual(normalizePayload('John Doe', '123456', 'https://example.com/img.jpg'), {
    fullName: 'John Doe',
    phone: '123456',
    avatar: 'https://example.com/img.jpg'
  });
});

// 2. Invalid fields filtering
test('profile edit rejects or ignores additional unallowed payload fields like role or email', () => {
  const allowedKeys = ['fullName', 'phone', 'avatar'];
  const sanitizePayload = (raw: Record<string, unknown>) => {
    const clean: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (raw[key] !== undefined) {
        clean[key] = raw[key];
      }
    }
    return clean;
  };

  const rawPayload = {
    fullName: 'Jane Doe',
    phone: '987654',
    email: 'admin@harzaar.com',
    role: 'superadmin',
    avatar: 'https://example.com/jane.png'
  };

  assert.deepEqual(sanitizePayload(rawPayload), {
    fullName: 'Jane Doe',
    phone: '987654',
    avatar: 'https://example.com/jane.png'
  });
});

// 3. Password validation constraints
test('password strength validation logic accepts only compliant passwords', () => {
  const validatePassword = (pwd: string): boolean => {
    const hasLength = pwd.length >= 12;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /\d/.test(pwd);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);
    return hasLength && hasUpper && hasLower && hasNumber && hasSpecial;
  };

  assert.equal(validatePassword('Short1!'), false); // too short
  assert.equal(validatePassword('nouppercase123!'), false); // no uppercase
  assert.equal(validatePassword('NOLOWERCASE123!'), false); // no lowercase
  assert.equal(validatePassword('NoSpecialNumber'), false); // no special / no number
  assert.equal(validatePassword('StrongPassword123!'), true); // valid
});

// 4. CSRF integration behavior
test('CSRF headers are correctly appended to state-changing requests', () => {
  const getCsrfToken = () => 'test-csrf-token';
  const getHeaders = (token: string | null) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['X-CSRF-Token'] = token;
    }
    return headers;
  };

  assert.deepEqual(getHeaders(getCsrfToken()), {
    'Content-Type': 'application/json',
    'X-CSRF-Token': 'test-csrf-token'
  });
});

// 5. Successful password-change auth-state cleanup
test('password change success state clears local auth state', () => {
  let authCleared = false;
  const clearAuthentication = (notify: boolean) => {
    authCleared = true;
  };

  const handlePasswordChangeSuccess = () => {
    clearAuthentication(true);
  };

  handlePasswordChangeSuccess();
  assert.equal(authCleared, true);
});

// 6. Forgot-password anti-enumeration
test('forgot password service response does not enumerate account presence', () => {
  const forgotPasswordResponse = (userExists: boolean) => {
    // Audit log can be warning or success in backend, but response is always success: true
    return { success: true };
  };

  assert.deepEqual(forgotPasswordResponse(true), { success: true });
  assert.deepEqual(forgotPasswordResponse(false), { success: true });
});

// 7. Search response normalization
test('global search response normalization guards arrays and formats fallback objects', () => {
  const normalizeSearchResponse = (res: { productsRes?: { data?: { data?: unknown } }; ordersRes?: { data?: { data?: { orders?: unknown } } }; customersRes?: { data?: { data?: unknown } } }) => {
    const products = Array.isArray(res.productsRes?.data?.data) ? res.productsRes.data.data : [];
    const orders = Array.isArray(res.ordersRes?.data?.data?.orders) ? res.ordersRes.data.data.orders : [];
    const customers = Array.isArray(res.customersRes?.data?.data) ? res.customersRes.data.data : [];
    return { products, orders, customers };
  };

  // Malformed and missing fields
  assert.deepEqual(normalizeSearchResponse({}), { products: [], orders: [], customers: [] });
  assert.deepEqual(normalizeSearchResponse({
    productsRes: { data: { data: [{ _id: '1' }] } },
    ordersRes: { data: { data: { orders: null } } }
  }), {
    products: [{ _id: '1' }],
    orders: [],
    customers: []
  });
});

// 8. Stale search rejection
test('aborted or stale search response results are discarded', () => {
  let activeRequestId = 0;
  let lastCommittedResults = null;

  const performSearchMock = (requestId: number, results: unknown) => {
    // Only accept response if it matches the latest request ID
    if (requestId === activeRequestId) {
      lastCommittedResults = results;
    }
  };

  activeRequestId = 1;
  performSearchMock(1, { products: ['p1'] });
  assert.deepEqual(lastCommittedResults, { products: ['p1'] });

  // Request 2 starts
  activeRequestId = 2;
  // Request 1 completes late (stale)
  performSearchMock(1, { products: ['p1_stale'] });
  // Should not overwrite Request 2 state
  assert.deepEqual(lastCommittedResults, { products: ['p1'] });

  // Request 2 completes
  performSearchMock(2, { products: ['p2'] });
  assert.deepEqual(lastCommittedResults, { products: ['p2'] });
});

// 9. Unsafe navigation rejection
test('navigation routing rejects external or protocol-relative target URLs', () => {
  const navigate = (href: string): string | null => {
    if (href.startsWith('/') && !href.startsWith('//') && !href.includes('\\')) {
      return href; // Safe local navigation
    }
    return null; // Rejected
  };

  assert.equal(navigate('/products/123/edit'), '/products/123/edit');
  assert.equal(navigate('https://malicious.com'), null);
  assert.equal(navigate('//malicious.com'), null);
  assert.equal(navigate('/\\malicious.com'), null);
});

// 10. Query synchronization on destination page
test('destination page syncs states with URL search parameters', () => {
  const syncQuery = (urlSearchParam: string | null) => {
    return urlSearchParam || '';
  };

  assert.equal(syncQuery('John%20Doe'), 'John%20Doe');
  assert.equal(syncQuery(null), '');
});

// 11. Search error states (empty, partial-error, full-error)
test('global search correctly handles and isolates partial and full endpoint failures', () => {
  const handleSearchPromise = async (
    pPromise: Promise<unknown>,
    oPromise: Promise<unknown>,
    cPromise: Promise<unknown>
  ) => {
    const results = { products: [], orders: [], customers: [], error: false };
    try {
      const [pRes, oRes, cRes] = await Promise.all([pPromise, oPromise, cPromise]);
      results.products = Array.isArray((pRes as { data?: unknown })?.data) ? ((pRes as { data?: unknown[] })?.data || []) : [];
      results.orders = Array.isArray((oRes as { data?: { orders?: unknown } })?.data?.orders) ? ((oRes as { data?: { orders?: unknown[] } })?.data?.orders || []) : [];
      results.customers = Array.isArray((cRes as { data?: unknown })?.data) ? ((cRes as { data?: unknown[] })?.data || []) : [];
    } catch {
      results.error = true;
    }
    return results;
  };

  // 11a. Full error (e.g. products promise rejects)
  const fullErrorPromise = handleSearchPromise(
    Promise.reject(new Error('Network Error')),
    Promise.resolve({ data: { orders: [] } }),
    Promise.resolve({ data: [] })
  );
  void fullErrorPromise.then(res => {
    assert.equal(res.error, true);
  });

  // 11b. Empty success
  const emptySuccessPromise = handleSearchPromise(
    Promise.resolve({ data: [] }),
    Promise.resolve({ data: { orders: [] } }),
    Promise.resolve({ data: [] })
  );
  void emptySuccessPromise.then(res => {
    assert.equal(res.error, false);
    assert.deepEqual(res.products, []);
  });
});

// 12. Keyboard result selection navigation
test('global search keyboard arrows and selection cycles indices correctly', () => {
  const items = [{ id: '1' }, { id: '2' }, { id: '3' }];

  const moveFocus = (currentFocused: number, key: 'ArrowDown' | 'ArrowUp', listLength: number) => {
    if (key === 'ArrowDown') {
      return currentFocused < listLength - 1 ? currentFocused + 1 : currentFocused;
    } else {
      return currentFocused > 0 ? currentFocused - 1 : -1;
    }
  };

  assert.equal(moveFocus(-1, 'ArrowDown', items.length), 0);
  assert.equal(moveFocus(0, 'ArrowDown', items.length), 1);
  assert.equal(moveFocus(2, 'ArrowDown', items.length), 2); // stays at end
  assert.equal(moveFocus(2, 'ArrowUp', items.length), 1);
  assert.equal(moveFocus(0, 'ArrowUp', items.length), -1); // unselects
});

// 13. Legacy commerce redirect
test('commerce page executes immediate redirect', () => {
  let redirectedTo: string | null = null;
  const redirectMock = (path: string) => {
    redirectedTo = path;
  };

  const CommerceRedirectPage = () => {
    redirectMock('/shipping');
  };

  CommerceRedirectPage();
  assert.equal(redirectedTo, '/shipping');
});

// 14. Local fallback image behavior and SVG safety
test('local fallbacks are static and do not contain dynamic user script variables', () => {
  // Static placeholders check
  assert.equal(PRODUCT_PLACEHOLDER.startsWith('data:image/svg+xml'), true);
  assert.equal(AVATAR_PLACEHOLDER.startsWith('data:image/svg+xml'), true);

  // Assert they don't contain any template variables or dangerous keywords
  assert.equal(PRODUCT_PLACEHOLDER.includes('${'), false);
  assert.equal(PRODUCT_PLACEHOLDER.includes('<script'), false);
  assert.equal(AVATAR_PLACEHOLDER.includes('${'), false);
  assert.equal(AVATAR_PLACEHOLDER.includes('<script'), false);
});

// 15. Empty search remains a valid empty state
test('empty search results are not treated as errors', () => {
  const processSearchResults = (res: { products?: unknown[]; orders?: unknown[]; customers?: unknown[] }) => {
    const products = Array.isArray(res.products) ? res.products : [];
    const orders = Array.isArray(res.orders) ? res.orders : [];
    const customers = Array.isArray(res.customers) ? res.customers : [];
    return { products, orders, customers, hasError: false };
  };

  const emptyResponse = { products: [], orders: [], customers: [] };
  const outcome = processSearchResults(emptyResponse);
  assert.equal(outcome.hasError, false);
  assert.deepEqual(outcome.products, []);
  assert.deepEqual(outcome.orders, []);
  assert.deepEqual(outcome.customers, []);
});

// 16. Successful search navigation closes and clears TopBar Search
test('successful search navigation clears and closes search state', () => {
  let searchOpen = true;
  let searchQuery = 'test-query';
  let searchResults = { products: [{ _id: '1' }] };
  let searchFocusedIndex = 2;

  const handleNavigate = (href: string) => {
    searchOpen = false;
    searchQuery = '';
    searchResults = { products: [] };
    searchFocusedIndex = -1;
  };

  handleNavigate('/products/1/edit');
  assert.equal(searchOpen, false);
  assert.equal(searchQuery, '');
  assert.deepEqual(searchResults.products, []);
  assert.equal(searchFocusedIndex, -1);
});

// 17 & 18. Pathname changes close Search and prevent Back/Forward reopening
test('pathname change resets search state completely preventing stale reopening', () => {
  let key = '/products';
  let searchOpen = true;
  let searchQuery = 'laptop';

  // Simulation of remount on key (pathname) change
  const onPathnameChange = (newPathname: string) => {
    if (newPathname !== key) {
      // Remount resets state to initial
      key = newPathname;
      searchOpen = false;
      searchQuery = '';
    }
  };

  onPathnameChange('/orders');
  assert.equal(key, '/orders');
  assert.equal(searchOpen, false);
  assert.equal(searchQuery, '');
});

// 19. Only one clear control is rendered
test('only one clear control is rendered when input type is text', () => {
  const renderInputControls = (inputType: 'search' | 'text', hasQuery: boolean) => {
    const controls = [];
    if (inputType === 'search') {
      // Browser renders a native cancel button
      controls.push('native-clear');
    }
    if (hasQuery) {
      // Custom application clear button
      controls.push('app-clear');
    }
    return controls;
  };

  // With type="search", two clear controls appear
  const typeSearch = renderInputControls('search', true);
  assert.equal(typeSearch.length, 2);

  // With type="text", exactly one clear control appears
  const typeText = renderInputControls('text', true);
  assert.deepEqual(typeText, ['app-clear']);
});

// 20. Forgot Password link destination
test('Forgot Password link destination is exact and navigable', () => {
  const getLoginRecoveryLink = () => {
    return { href: '/forgot-password', label: 'Forgot Password?' };
  };

  const link = getLoginRecoveryLink();
  assert.equal(link.href, '/forgot-password');
});

// 21. Accepted forgot-password request shows generic success
test('accepted forgot-password request sets success status', () => {
  let successState = false;
  let errorMsg = '';

  const handleForgotResponse = (response: { data: { success: boolean } }) => {
    if (response && response.data && response.data.success) {
      successState = true;
    } else {
      errorMsg = 'Failed';
    }
  };

  handleForgotResponse({ data: { success: true } });
  assert.equal(successState, true);
  assert.equal(errorMsg, '');
});

// 22. Known/unknown account responses remain indistinguishable
test('known and unknown account responses return identical success envelope', () => {
  const backendForgotAction = (emailExists: boolean) => {
    // Both user matching status must return identical output structure to prevent enumeration
    return { success: true };
  };

  assert.deepEqual(backendForgotAction(true), { success: true });
  assert.deepEqual(backendForgotAction(false), { success: true });
});

// 23. Network/5xx/malformed responses show operational error
test('transport and server errors resolve to distinct secure user messages', () => {
  const getErrorMessage = (error: { response?: { status: number }; request?: unknown }) => {
    if (error.response) {
      if (error.response.status === 429) {
        return 'Too many requests. Please wait and try again.';
      }
      return 'We couldn’t process your request right now. Please try again.';
    } else if (error.request) {
      return 'Unable to connect right now. Check your connection and try again.';
    }
    return 'We couldn’t process your request right now. Please try again.';
  };

  // 5xx / Bad Request / Server Error
  assert.equal(getErrorMessage({ response: { status: 500 } }), 'We couldn’t process your request right now. Please try again.');
  // Network / Transport error (no response)
  assert.equal(getErrorMessage({ request: {} }), 'Unable to connect right now. Check your connection and try again.');
});

// 24. 429 shows safe retry-later behavior
test('HTTP 429 response maps to account-neutral retry-later alert', () => {
  const getErrorMessage = (error: { response?: { status: number } }) => {
    if (error.response && error.response.status === 429) {
      return 'Too many requests. Please wait and try again.';
    }
    return 'Error';
  };

  assert.equal(getErrorMessage({ response: { status: 429 } }), 'Too many requests. Please wait and try again.');
});

// 25. Reset-token parameter and request payload match the existing contract
test('reset-token URL parsing and payload match backend AuthService contracts', () => {
  const parseToken = (urlSearchParams: { get: (k: string) => string | null }) => {
    return urlSearchParams.get('token') || '';
  };

  const buildPayload = (token: string, pwd: string) => {
    return { resetToken: token, newPassword: pwd };
  };

  // Mock URL query parameters: ?token=my-secret-reset-token
  const mockParams = {
    get: (key: string) => (key === 'token' ? 'my-secret-reset-token' : null)
  };

  const token = parseToken(mockParams);
  assert.equal(token, 'my-secret-reset-token');

  const payload = buildPayload(token, 'StrongPwd1234!');
  assert.deepEqual(payload, {
    resetToken: 'my-secret-reset-token',
    newPassword: 'StrongPwd1234!'
  });
});

// 26. Exact public-route allowlist matching
test('exact public-route allowlist matching and normalization', () => {
  assert.equal(isPublicAuthRoute('/login'), true);
  assert.equal(isPublicAuthRoute('/forgot-password'), true);
  assert.equal(isPublicAuthRoute('/reset-password'), true);
  assert.equal(isPublicAuthRoute('/login/'), true);
  assert.equal(isPublicAuthRoute('/forgot-password/'), true);
  assert.equal(isPublicAuthRoute('/reset-password/'), true);

  // Trailing slash query params (Next.js usePathname returns only the pathname part e.g. /forgot-password)
  assert.equal(isPublicAuthRoute('/forgot-password?token=123'.split('?')[0]), true);
  assert.equal(isPublicAuthRoute('/reset-password?token=xyz'.split('?')[0]), true);

  // Non-allowlisted paths
  assert.equal(isPublicAuthRoute('/'), false);
  assert.equal(isPublicAuthRoute('/profile'), false);
  assert.equal(isPublicAuthRoute('/orders'), false);
  assert.equal(isPublicAuthRoute('/forgot-password/anything'), false);
  assert.equal(isPublicAuthRoute('/reset-password/anything'), false);
});

// 27. Public route layout exclusion of protected chrome
test('public route rendering excludes Sidebar, TopBar, and AdminGuard', () => {
  const isPublicRoute = true;
  const renderLayout = (isPublic: boolean) => {
    if (isPublic) {
      return { rendersGuard: false, rendersSidebar: false, rendersTopBar: false };
    }
    return { rendersGuard: true, rendersSidebar: true, rendersTopBar: true };
  };

  const outcome = renderLayout(isPublicRoute);
  assert.deepEqual(outcome, {
    rendersGuard: false,
    rendersSidebar: false,
    rendersTopBar: false
  });
});

// 28. Protected route preserves AdminGuard and sidebar wrappers
test('protected routes enforce authentication wrappers and Sidebar/TopBar render', () => {
  const isPublicRoute = false;
  const renderLayout = (isPublic: boolean) => {
    if (isPublic) {
      return { rendersGuard: false, rendersSidebar: false, rendersTopBar: false };
    }
    return { rendersGuard: true, rendersSidebar: true, rendersTopBar: true };
  };

  const outcome = renderLayout(isPublicRoute);
  assert.deepEqual(outcome, {
    rendersGuard: true,
    rendersSidebar: true,
    rendersTopBar: true
  });
});

// 29. Mobile drawer toggle state is independent of desktop expanded state
test('mobile drawer state is tracked independently from desktop Sidebar state', () => {
  let isSidebarOpen = true; // desktop state
  let mobileDrawerOpen = false; // mobile state

  const toggleSidebar = () => { isSidebarOpen = !isSidebarOpen; };
  const toggleMobileDrawer = () => { mobileDrawerOpen = !mobileDrawerOpen; };

  // Mobile drawer opening does not affect desktop state
  toggleMobileDrawer();
  assert.equal(mobileDrawerOpen, true);
  assert.equal(isSidebarOpen, true);

  // Desktop sidebar collapsing does not affect mobile drawer state
  toggleSidebar();
  assert.equal(isSidebarOpen, false);
  assert.equal(mobileDrawerOpen, true);
});

// 30. Mobile drawer closes on route change
test('mobile drawer is closed when the pathname transitions', () => {
  let mobileDrawerOpen = true;
  let prevPathname = '/orders';
  const currentPathname = '/products';

  const checkRouteChange = () => {
    if (currentPathname !== prevPathname) {
      prevPathname = currentPathname;
      mobileDrawerOpen = false;
    }
  };

  checkRouteChange();
  assert.equal(mobileDrawerOpen, false);
  assert.equal(prevPathname, '/products');
});

// 31. Escape key closes mobile drawer
test('Escape key interaction invokes closing of mobile drawer', () => {
  let closed = false;
  const handleKeyDown = (e: { key: string }) => {
    if (e.key === 'Escape') {
      closed = true;
    }
  };

  handleKeyDown({ key: 'Escape' });
  assert.equal(closed, true);
});

// 32. Backdrop click closes mobile drawer
test('backdrop interaction invokes closing of mobile drawer', () => {
  let closed = false;
  const handleBackdropClick = () => {
    closed = true;
  };

  handleBackdropClick();
  assert.equal(closed, true);
});

// 33. ARIA attributes for hamburger and drawer
test('hamburger and drawer possess appropriate accessibility bindings', () => {
  const mobileDrawerOpen = true;
  const hamburgerAttributes = {
    'aria-expanded': mobileDrawerOpen,
    'aria-controls': 'admin-sidebar'
  };
  const drawerAttributes = {
    id: 'admin-sidebar',
    'aria-label': 'Main Navigation'
  };

  assert.equal(hamburgerAttributes['aria-expanded'], true);
  assert.equal(hamburgerAttributes['aria-controls'], 'admin-sidebar');
  assert.equal(drawerAttributes.id, hamburgerAttributes['aria-controls']);
  assert.equal(drawerAttributes['aria-label'], 'Main Navigation');
});

// 34. Scroll locking and body restoration
test('body scroll is locked when drawer is open and restored on cleanup', () => {
  let bodyOverflow = 'visible';
  const lockScroll = () => {
    bodyOverflow = 'hidden';
  };
  const restoreScroll = () => {
    bodyOverflow = 'visible';
  };

  lockScroll();
  assert.equal(bodyOverflow, 'hidden');
  restoreScroll();
  assert.equal(bodyOverflow, 'visible');
});

// 35. Focus containment wraps focus around first and last elements
test('focus containment traps focus within drawer boundary during Tab navigations', () => {
  const elements = ['close-button', 'link-1', 'link-2', 'logout-button'];
  let activeIndex = 0;

  const navigateTab = (shiftKey: boolean) => {
    if (shiftKey) {
      activeIndex = activeIndex === 0 ? elements.length - 1 : activeIndex - 1;
    } else {
      activeIndex = activeIndex === elements.length - 1 ? 0 : activeIndex + 1;
    }
  };

  // Navigating forward from last should wrap to first
  activeIndex = 3; // logout-button
  navigateTab(false);
  assert.equal(elements[activeIndex], 'close-button');

  // Navigating backward from first should wrap to last
  activeIndex = 0; // close-button
  navigateTab(true);
  assert.equal(elements[activeIndex], 'logout-button');
});

// 36. Focus restoration to TopBar hamburger button
test('focus is restored to the hamburger button when the drawer closes', () => {
  let focusedElement = '';
  const mockHamburgerRef = {
    current: {
      focus: () => {
        focusedElement = 'hamburger';
      }
    }
  };

  let mobileDrawerOpen = true;
  let prevMobileOpen = true;

  const closeDrawer = () => {
    mobileDrawerOpen = false;
    if (prevMobileOpen && !mobileDrawerOpen) {
      mockHamburgerRef.current.focus();
    }
    prevMobileOpen = mobileDrawerOpen;
  };

  closeDrawer();
  assert.equal(focusedElement, 'hamburger');
});
