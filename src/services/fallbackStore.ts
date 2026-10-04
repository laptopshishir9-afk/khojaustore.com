import type { Product, Review, Order, UserAccount, StoreSettings } from '../types/index.ts';
import rawStoreData from '../../data/store.json';

export const resolveAssetUrl = (url?: string): string => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:') || url.startsWith('./')) {
    return url;
  }
  if (url.startsWith('/')) {
    return `.${url}`;
  }
  return `./${url}`;
};

const normalizeStoreSettings = (s: StoreSettings): StoreSettings => {
  return {
    ...s,
    logoUrl: resolveAssetUrl(s.logoUrl || '/src/assets/images/khojau_logo.svg'),
    heroBannerUrl: resolveAssetUrl(s.heroBannerUrl || '/src/assets/images/khojau_hero_nepal_1791032655932.jpg'),
    promoBannerUrl: resolveAssetUrl(s.promoBannerUrl || '/src/assets/images/banner_tech_lifestyle_1790995930360.jpg'),
    nepalFlagUrl: resolveAssetUrl(s.nepalFlagUrl),
    founder: {
      ...s.founder,
      photoUrl: resolveAssetUrl(s.founder?.photoUrl || '/src/assets/images/founder_shishir_1790996757613.jpg'),
    },
    promotionalOffer: s.promotionalOffer
      ? {
          ...s.promotionalOffer,
          popupImageUrl: resolveAssetUrl(s.promotionalOffer.popupImageUrl),
        }
      : undefined,
    qrPaymentSettings: s.qrPaymentSettings
      ? {
          ...s.qrPaymentSettings,
          qrImageUrl: resolveAssetUrl(s.qrPaymentSettings.qrImageUrl),
        }
      : undefined,
  };
};

const normalizeProduct = (p: Product): Product => ({
  ...p,
  images: (p.images || []).map((img) => resolveAssetUrl(img)),
});

export interface LocalAdminCredentials {
  email: string;
  username: string;
  passwordHash?: string;
  salt?: string;
  plainPassword?: string;
  isConfigured: boolean;
  updatedAt: string;
}

export interface LocalStoreDB {
  settings: StoreSettings;
  products: Product[];
  reviews: Review[];
  orders: Order[];
  customers: (UserAccount & { password?: string })[];
  adminCredentials?: LocalAdminCredentials;
}

const LOCAL_DB_KEY = 'khojau_static_store_db_v1';

export function getLocalStoreDB(): LocalStoreDB {
  try {
    const saved = localStorage.getItem(LOCAL_DB_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        settings: normalizeStoreSettings({
          ...(rawStoreData.settings as unknown as StoreSettings),
          ...(parsed.settings || {}),
          websiteTexts: {
            ...(rawStoreData.settings.websiteTexts as any),
            ...((parsed.settings && parsed.settings.websiteTexts) || {}),
          },
        }),
        products: Array.isArray(parsed.products)
          ? parsed.products.map(normalizeProduct)
          : (rawStoreData.products as unknown as Product[]).map(normalizeProduct),
        reviews: Array.isArray(parsed.reviews) ? parsed.reviews : (rawStoreData.reviews as unknown as Review[]),
        orders: Array.isArray(parsed.orders) ? parsed.orders : (rawStoreData.orders as unknown as Order[]),
        customers: Array.isArray(parsed.customers) ? parsed.customers : (rawStoreData.customers as unknown as UserAccount[]),
        adminCredentials: parsed.adminCredentials || (rawStoreData as any).adminCredentials,
      };
    }
  } catch (e) {
    console.warn('Fallback store parse warning:', e);
  }

  return {
    settings: normalizeStoreSettings(rawStoreData.settings as unknown as StoreSettings),
    products: (rawStoreData.products as unknown as Product[]).map(normalizeProduct),
    reviews: (rawStoreData.reviews as unknown as Review[]) || [],
    orders: (rawStoreData.orders as unknown as Order[]) || [],
    customers: (rawStoreData.customers as unknown as UserAccount[]) || [],
    adminCredentials: (rawStoreData as any).adminCredentials,
  };
}

export function saveLocalStoreDB(db: LocalStoreDB): void {
  try {
    localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
  } catch (e) {
    console.warn('Could not save to localStorage:', e);
  }
}
