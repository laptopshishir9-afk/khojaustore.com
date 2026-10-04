import type { Product, Review, Order, UserAccount, StoreSettings, DashboardStats } from '../types/index.ts';
import { getLocalStoreDB, saveLocalStoreDB, resolveAssetUrl } from './fallbackStore.ts';

const BASE_URL = '';

const DEFAULT_CATEGORIES = [
  'Electronics',
  'Fashion',
  'Home & Kitchen',
  'Beauty & Personal Care',
  'Handicrafts & Art',
  'Groceries & Tea',
  'Accessories',
];

function computeCategories(products: Product[]): string[] {
  const fromProducts = products.map((p) => p.category).filter(Boolean);
  return Array.from(new Set([...DEFAULT_CATEGORIES, ...fromProducts]));
}

export async function fetchStoreSettings(): Promise<{ settings: StoreSettings; categories: string[] }> {
  try {
    const res = await fetch(`${BASE_URL}/api/settings`);
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      if (data && data.settings) {
        return {
          settings: {
            ...data.settings,
            logoUrl: resolveAssetUrl(data.settings.logoUrl),
            heroBannerUrl: resolveAssetUrl(data.settings.heroBannerUrl),
            promoBannerUrl: resolveAssetUrl(data.settings.promoBannerUrl),
            nepalFlagUrl: resolveAssetUrl(data.settings.nepalFlagUrl),
          },
          categories: data.categories || DEFAULT_CATEGORIES,
        };
      }
    }
  } catch {
    // Static hosting / GitHub Pages fallback
  }

  const localDb = getLocalStoreDB();
  return {
    settings: localDb.settings,
    categories: computeCategories(localDb.products),
  };
}

export async function updateStoreSettings(settings: Partial<StoreSettings>, token: string): Promise<StoreSettings> {
  try {
    const res = await fetch(`${BASE_URL}/api/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(settings),
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.settings;
    }
  } catch {
    // Fallback to local storage on static hosting
  }

  const localDb = getLocalStoreDB();
  localDb.settings = {
    ...localDb.settings,
    ...settings,
    founder: { ...localDb.settings.founder, ...(settings.founder || {}) },
    aboutBrand: { ...localDb.settings.aboutBrand, ...(settings.aboutBrand || {}) },
    websiteTexts: { ...(localDb.settings.websiteTexts as any), ...(settings.websiteTexts || {}) },
  };
  saveLocalStoreDB(localDb);
  return localDb.settings;
}

export async function fetchProducts(
  params: {
    category?: string;
    search?: string;
    sort?: string;
    featured?: boolean;
    popular?: boolean;
    isNew?: boolean;
    limit?: number;
  } = {}
): Promise<Product[]> {
  try {
    const url = new URL(`${BASE_URL}/api/products`, window.location.origin);
    if (params.category) url.searchParams.set('category', params.category);
    if (params.search) url.searchParams.set('search', params.search);
    if (params.sort) url.searchParams.set('sort', params.sort);
    if (params.featured) url.searchParams.set('featured', 'true');
    if (params.popular) url.searchParams.set('popular', 'true');
    if (params.isNew) url.searchParams.set('isNew', 'true');
    if (params.limit) url.searchParams.set('limit', String(params.limit));

    const res = await fetch(url.toString());
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      if (Array.isArray(data.products)) {
        return data.products.map((p: Product) => ({
          ...p,
          images: (p.images || []).map((img) => resolveAssetUrl(img)),
        }));
      }
    }
  } catch {
    // Static hosting / GitHub Pages fallback
  }

  const localDb = getLocalStoreDB();
  let list = localDb.products.filter((p) => p.isVisible !== false);

  if (params.category && params.category !== 'All') {
    list = list.filter((p) => p.category.toLowerCase() === params.category!.toLowerCase());
  }
  if (params.search) {
    const q = params.search.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );
  }
  if (params.featured) list = list.filter((p) => p.isFeatured);
  if (params.popular) list = list.filter((p) => p.isPopular);
  if (params.isNew) list = list.filter((p) => p.isNew);

  if (params.sort === 'price_asc') {
    list.sort((a, b) => (a.discountPrice || a.price) - (b.discountPrice || b.price));
  } else if (params.sort === 'price_desc') {
    list.sort((a, b) => (b.discountPrice || b.price) - (a.discountPrice || a.price));
  } else if (params.sort === 'newest') {
    list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  if (params.limit) {
    list = list.slice(0, params.limit);
  }
  return list;
}

export async function fetchAdminProducts(token: string): Promise<Product[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/admin/products`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.products;
    }
  } catch {}

  return getLocalStoreDB().products;
}

export async function fetchProduct(id: string): Promise<{ product: Product; reviews: Review[] }> {
  try {
    const res = await fetch(`${BASE_URL}/api/products/${id}`);
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      return res.json();
    }
  } catch {}

  const localDb = getLocalStoreDB();
  const product = localDb.products.find((p) => p.id === id) || localDb.products[0];
  const reviews = localDb.reviews.filter((r) => r.productId === id);
  return { product, reviews };
}

export async function createProduct(productData: Partial<Product>, token: string): Promise<Product> {
  try {
    const res = await fetch(`${BASE_URL}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(productData),
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.product;
    }
  } catch {}

  const localDb = getLocalStoreDB();
  const newProd: Product = {
    id: `prod-${Date.now()}`,
    name: productData.name || 'New Product',
    slug: (productData.name || 'product').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    category: productData.category || 'Electronics',
    price: Number(productData.price) || 0,
    discountPrice: productData.discountPrice ? Number(productData.discountPrice) : undefined,
    isDiscountActive: productData.isDiscountActive ?? true,
    discountPercentage: productData.discountPercentage,
    description: productData.description || '',
    images:
      Array.isArray(productData.images) && productData.images.length > 0
        ? productData.images
        : [resolveAssetUrl('/src/assets/images/hero_nepal_shopping_1790995906814.jpg')],
    specifications: productData.specifications || {},
    stock: Number(productData.stock) ?? 10,
    variants: productData.variants || {},
    isFeatured: Boolean(productData.isFeatured),
    isNew: productData.isNew ?? true,
    isPopular: Boolean(productData.isPopular),
    isVisible: productData.isVisible !== false,
    rating: 5,
    reviewCount: 0,
    createdAt: new Date().toISOString(),
  };
  localDb.products.unshift(newProd);
  saveLocalStoreDB(localDb);
  return newProd;
}

export async function updateProduct(id: string, productData: Partial<Product>, token: string): Promise<Product> {
  try {
    const res = await fetch(`${BASE_URL}/api/products/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(productData),
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.product;
    }
  } catch {}

  const localDb = getLocalStoreDB();
  const idx = localDb.products.findIndex((p) => p.id === id);
  if (idx > -1) {
    localDb.products[idx] = { ...localDb.products[idx], ...productData };
    saveLocalStoreDB(localDb);
    return localDb.products[idx];
  }
  throw new Error('Product not found');
}

export async function deleteProduct(id: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/products/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.ok) return true;
  } catch {}

  const localDb = getLocalStoreDB();
  localDb.products = localDb.products.filter((p) => p.id !== id);
  saveLocalStoreDB(localDb);
  return true;
}

export async function submitReview(reviewData: {
  productId: string;
  userName: string;
  userCity: string;
  rating: number;
  comment: string;
}): Promise<Review> {
  try {
    const res = await fetch(`${BASE_URL}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewData),
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.review;
    }
  } catch {}

  const localDb = getLocalStoreDB();
  const rev: Review = {
    id: `rev-${Date.now()}`,
    productId: reviewData.productId,
    userName: reviewData.userName,
    userCity: reviewData.userCity || 'Butwal, Nepal',
    rating: reviewData.rating,
    comment: reviewData.comment,
    date: new Date().toISOString().split('T')[0],
    isVerified: true,
    status: 'approved',
  };
  localDb.reviews.unshift(rev);
  saveLocalStoreDB(localDb);
  return rev;
}

export async function fetchAdminReviews(token: string): Promise<Review[]> {
  try {
    const res = await fetch(`${BASE_URL}/api/admin/reviews`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.reviews;
    }
  } catch {}
  return getLocalStoreDB().reviews;
}

export async function updateReviewStatus(id: string, status: 'approved' | 'rejected', token: string): Promise<Review> {
  try {
    const res = await fetch(`${BASE_URL}/api/admin/reviews/${id}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.review;
    }
  } catch {}

  const localDb = getLocalStoreDB();
  const rev = localDb.reviews.find((r) => r.id === id);
  if (rev) {
    rev.status = status;
    saveLocalStoreDB(localDb);
    return rev;
  }
  throw new Error('Review not found');
}

export async function deleteReview(id: string, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/admin/reviews/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.ok) return true;
  } catch {}

  const localDb = getLocalStoreDB();
  localDb.reviews = localDb.reviews.filter((r) => r.id !== id);
  saveLocalStoreDB(localDb);
  return true;
}

export async function createOrder(orderPayload: any): Promise<Order> {
  try {
    const res = await fetch(`${BASE_URL}/api/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderPayload),
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.order;
    }
  } catch {}

  const localDb = getLocalStoreDB();
  const orderId = `KHJ-${Math.floor(10000 + Math.random() * 90000)}`;
  const subtotal = Number(orderPayload.subtotal) || 0;
  const deliveryFee = Number(orderPayload.deliveryFee) || 0;
  const total = subtotal + deliveryFee;

  const newOrder: Order = {
    id: orderId,
    customerId: orderPayload.customerId,
    customerName: orderPayload.customerName,
    customerEmail: orderPayload.customerEmail || '',
    customerPhone: orderPayload.customerPhone,
    shippingAddress: orderPayload.shippingAddress,
    items: orderPayload.items || [],
    subtotal,
    deliveryFee,
    total,
    paymentMethod: 'qr_payment',
    paymentStatus: 'awaiting_verification',
    orderStatus: 'pending',
    orderRemark: `Khojau Order #${orderId} - ${orderPayload.customerName}`,
    notes: orderPayload.notes || '',
    createdAt: new Date().toISOString(),
  };
  localDb.orders.unshift(newOrder);
  saveLocalStoreDB(localDb);
  return newOrder;
}

export async function submitPaymentProof(
  orderId: string,
  proof: { transactionId: string; paymentScreenshotUrl?: string }
): Promise<Order> {
  try {
    const res = await fetch(`${BASE_URL}/api/orders/${orderId}/payment-proof`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proof),
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.order;
    }
  } catch {}

  const localDb = getLocalStoreDB();
  const ord = localDb.orders.find((o) => o.id === orderId);
  if (ord) {
    ord.transactionId = proof.transactionId;
    if (proof.paymentScreenshotUrl) ord.paymentScreenshotUrl = proof.paymentScreenshotUrl;
    ord.paymentSubmittedAt = new Date().toISOString();
    ord.paymentStatus = 'pending_verification';
    saveLocalStoreDB(localDb);
    return ord;
  }
  throw new Error('Order not found');
}

export async function uploadPaymentProof(base64Data: string): Promise<string> {
  try {
    const res = await fetch(`${BASE_URL}/api/upload-payment-proof`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: base64Data }),
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.url;
    }
  } catch {}
  return base64Data;
}

export async function fetchCustomerOrders(params: {
  customerId?: string;
  customerEmail?: string;
  customerPhone?: string;
}): Promise<Order[]> {
  try {
    const url = new URL(`${BASE_URL}/api/orders`, window.location.origin);
    if (params.customerId) url.searchParams.set('customerId', params.customerId);
    if (params.customerEmail) url.searchParams.set('customerEmail', params.customerEmail);
    if (params.customerPhone) url.searchParams.set('customerPhone', params.customerPhone);

    const res = await fetch(url.toString());
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.orders;
    }
  } catch {}

  return getLocalStoreDB().orders;
}

export async function fetchAdminOrders(token: string, filter?: { status?: string; search?: string }): Promise<Order[]> {
  try {
    const url = new URL(`${BASE_URL}/api/admin/orders`, window.location.origin);
    if (filter?.status && filter.status !== 'all') url.searchParams.set('status', filter.status);
    if (filter?.search) url.searchParams.set('search', filter.search);

    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.orders;
    }
  } catch {}

  return getLocalStoreDB().orders;
}

export async function updateOrderStatus(
  id: string,
  updates: { orderStatus?: string; paymentStatus?: string },
  token: string
): Promise<Order> {
  try {
    const res = await fetch(`${BASE_URL}/api/admin/orders/${id}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(updates),
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.order;
    }
  } catch {}

  const localDb = getLocalStoreDB();
  const ord = localDb.orders.find((o) => o.id === id);
  if (ord) {
    if (updates.orderStatus) ord.orderStatus = updates.orderStatus as any;
    if (updates.paymentStatus) ord.paymentStatus = updates.paymentStatus as any;
    saveLocalStoreDB(localDb);
    return ord;
  }
  throw new Error('Order not found');
}

export async function fetchAdminStats(token: string): Promise<DashboardStats> {
  try {
    const res = await fetch(`${BASE_URL}/api/admin/stats`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.stats;
    }
  } catch {}

  const localDb = getLocalStoreDB();
  const totalOrders = localDb.orders.length;
  const pendingOrders = localDb.orders.filter(
    (o) => o.orderStatus === 'pending' || o.orderStatus === 'processing'
  ).length;
  const completedOrders = localDb.orders.filter((o) => o.orderStatus === 'delivered').length;
  const cancelledOrders = localDb.orders.filter((o) => o.orderStatus === 'cancelled').length;
  const totalRevenue = localDb.orders
    .filter((o) => o.orderStatus !== 'cancelled')
    .reduce((sum, o) => sum + o.total, 0);

  return {
    totalOrders,
    pendingOrders,
    completedOrders,
    cancelledOrders,
    totalRevenue,
    totalProducts: localDb.products.length,
    outOfStockCount: localDb.products.filter((p) => p.stock <= 0).length,
    totalCustomers: localDb.customers.length,
    recentOrders: localDb.orders.slice(0, 8),
  };
}

export async function adminLogin(identifier: string, password: string): Promise<{ token: string; user: any }> {
  const res = await fetch(`${BASE_URL}/api/auth/admin-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Invalid email or password');
  }
  return res.json();
}

export async function verifyAdminSession(token: string): Promise<{ valid: boolean; user: any }> {
  const res = await fetch(`${BASE_URL}/api/auth/admin-session`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Admin session expired or invalid');
  return res.json();
}

export async function adminLogout(token: string): Promise<boolean> {
  try {
    await fetch(`${BASE_URL}/api/auth/admin-logout`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
    });
  } catch {}
  return true;
}

export async function getAdminStatus(): Promise<{ isConfigured: boolean; username: string }> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/admin-status`);
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      return res.json();
    }
  } catch {}
  return { isConfigured: true, username: 'admin' };
}

export async function adminSetup(data: {
  username: string;
  email: string;
  password: string;
}): Promise<{ token: string; user: any }> {
  const res = await fetch(`${BASE_URL}/api/auth/admin-setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Admin setup failed');
  }
  return res.json();
}

export async function customerLogin(email: string, password: string): Promise<{ token: string; user: UserAccount }> {
  const res = await fetch(`${BASE_URL}/api/auth/customer-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Login failed');
  }
  return res.json();
}

export async function customerRegister(userData: any): Promise<{ token: string; user: UserAccount }> {
  const res = await fetch(`${BASE_URL}/api/auth/customer-register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Registration failed');
  }
  return res.json();
}

export async function verifySession(token: string): Promise<{ user: UserAccount }> {
  const res = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Session expired');
  return res.json();
}

export async function updateCustomerProfile(data: Partial<UserAccount>, token: string): Promise<UserAccount> {
  const res = await fetch(`${BASE_URL}/api/auth/customer-profile`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to update profile');
  const resData = await res.json();
  return resData.user;
}

export async function uploadImage(base64Data: string, token: string, filename?: string): Promise<string> {
  try {
    const res = await fetch(`${BASE_URL}/api/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ data: base64Data, filename }),
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      const data = await res.json();
      return data.url;
    }
  } catch {}
  return base64Data;
}

export async function updateAdminCredentials(
  credentials: { newUsername?: string; newEmail?: string; newPassword?: string },
  token: string
): Promise<any> {
  const res = await fetch(`${BASE_URL}/api/auth/admin-credentials`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify(credentials),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to update admin credentials');
  }
  return res.json();
}

export async function sendAiChatMessage(payload: {
  message: string;
  history?: { role: string; text: string }[];
  currentProductId?: string;
}): Promise<{ reply: string; recommendedProductIds: string[] }> {
  try {
    const res = await fetch(`${BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok && res.headers.get('content-type')?.includes('application/json')) {
      return res.json();
    }
  } catch {}

  const localDb = getLocalStoreDB();
  const s = localDb.settings;
  const activeProducts = localDb.products.filter((p) => p.isVisible !== false);
  const q = payload.message.toLowerCase();

  if (
    q.includes('location') ||
    q.includes('where') ||
    q.includes('address') ||
    q.includes('based') ||
    q.includes('butwal')
  ) {
    return {
      reply: `Namaste! 🙏 ${s.storeName} (खोजौँ) is proudly based in **Butwal, Nepal** (${s.storeAddress || 'Butwal, Nepal'}). We deliver across Butwal, Rupandehi, and all 7 provinces of Nepal.`,
      recommendedProductIds: [],
    };
  }
  if (q.includes('payment') || q.includes('qr') || q.includes('esewa') || q.includes('khalti')) {
    return {
      reply: `At ${s.storeName}, we accept Official QR Payments via ${s.qrPaymentSettings?.providerName || 'eSewa, Khalti, Fonepay & Mobile Banking'}. Simply scan our QR code at checkout and submit your Transaction ID for verification.`,
      recommendedProductIds: [],
    };
  }
  if (q.includes('delivery') || q.includes('shipping') || q.includes('charge')) {
    return {
      reply: `Delivery from **Butwal, Nepal**:\n• Butwal & Rupandehi: Rs. ${s.deliveryKathmanduFee} (Free over Rs. ${s.freeDeliveryThreshold})\n• Outside Butwal Nationwide: Rs. ${s.deliveryOutsideFee} flat.`,
      recommendedProductIds: [],
    };
  }

  return {
    reply: `Namaste! 🙏 Welcome to **${s.storeName} (खोजौँ)** in **Butwal, Nepal**. Feel free to browse our catalog or contact us at ${s.contactPhone} (${s.contactEmail}).`,
    recommendedProductIds: activeProducts.slice(0, 3).map((p) => p.id),
  };
}
