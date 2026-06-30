export interface GalleryImage {
  slot: number;
  src: string;
  title: string;
  category: string;
  x?: number;
  y?: number;
  scale?: number;
}

export interface Stat {
  number: string;
  label: string;
}

export interface Service {
  title: string;
  description: string;
  price: string;
}

export interface ContactLink {
  label: string;
  value: string;
  href: string;
}

export interface PortfolioContent {
  id: string;
  customer_id: string;
  subdomain: string;
  logo_text: string;
  hero_eyebrow: string;
  hero_name: string;
  hero_name_italic: string;
  hero_subtitle: string;
  hero_cta1_label: string;
  hero_cta1_href: string;
  hero_cta2_label: string;
  hero_cta2_href: string;
  hero_images: Array<{ src: string }>;
  gallery_images: GalleryImage[];
  about_title: string;
  about_title_italic: string;
  about_bio_1: string;
  about_quote: string;
  about_bio_2: string;
  about_image: string;
  stats: Stat[];
  services: Service[];
  contact_heading: string;
  contact_heading_italic: string;
  contact_subtext: string;
  contact_links: ContactLink[];
  footer_name: string;
  footer_status: string;
  updated_at: string;
  extra_fields: Record<string, unknown>;
  template_id?: string;
}

export interface EditToken {
  id: string;
  customer_id: string;
  subdomain: string;
  token: string;
  used: boolean;
  expires_at: string;
}

// Default empty structures for new records
export const defaultGalleryImages = (): GalleryImage[] =>
  Array.from({ length: 15 }, (_, i) => ({ slot: i + 1, src: '', title: '', category: '' }));

export const defaultStats = (): Stat[] => [
  { number: '', label: '' },
  { number: '', label: '' },
  { number: '', label: '' },
];
