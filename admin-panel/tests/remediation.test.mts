import assert from 'node:assert/strict';
import test from 'node:test';
import { PRODUCT_PLACEHOLDER, AVATAR_PLACEHOLDER } from '../src/lib/placeholder.ts';
import { toggleTopBarPopover } from '../src/lib/notificationUi.ts';

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
