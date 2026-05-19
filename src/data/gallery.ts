export type GalleryCategory =
  | "Face Painting"
  | "Balloon Twisting"
  | "Glitter Tattoos"
  | "Face Gems"
  | "Event Atmosphere"
  | "Setup";

export type GalleryItem = {
  /** Public path to the image file, e.g. /images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-01.jpg */
  src: string;
  alt: string;
  category: GalleryCategory;
  /** Specific service this image represents */
  service: string;
  /** Optional event type context */
  eventType?: string;
  /** City or region (no address) */
  location?: string;
  /** Show prominently on homepage/service pages */
  featured?: boolean;
  /**
   * Must be true before any photo of an identifiable person is published.
   * SVG placeholders may use true since they contain no personal data.
   * Set to false on real photos until guardian/customer written consent is confirmed.
   */
  permissionConfirmed: boolean;
};

// ---------------------------------------------------------------------------
// PLACEHOLDER DATA — all src values point to the SVG placeholder until the
// owner copies real photos into public/images/gallery/ and updates src fields.
//
// Intended final filename convention:
//   /images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-01.jpg
//   /images/gallery/balloon-twisting/happy-faces-la-balloon-twisting-party-los-angeles-01.jpg
//   /images/gallery/glitter-tattoos/happy-faces-la-glitter-tattoos-kids-party-01.jpg
//   /images/gallery/face-gems/happy-faces-la-face-gems-party-los-angeles-01.jpg
//   /images/gallery/event-atmosphere/happy-faces-la-event-atmosphere-birthday-los-angeles-01.jpg
//   /images/gallery/setup/happy-faces-la-professional-setup-kit-01.jpg
// ---------------------------------------------------------------------------

const PLACEHOLDER = "/images/placeholders/happy-faces-la-hero-placeholder.svg";

export const galleryItems: GalleryItem[] = [
  // Face Painting — 8 entries
  {
    src: PLACEHOLDER,
    alt: "Happy Faces LA face painter at a kids birthday party in Los Angeles",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: true,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Colorful face painting designs at a Los Angeles birthday party by Happy Faces LA",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Happy Faces LA face painting at a school carnival in Los Angeles",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "School Carnival",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Kids face painting by Happy Faces LA at a festival in Los Angeles",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Festival",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Face painting for a birthday party in Burbank by Happy Faces LA",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Burbank",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Happy Faces LA face painting at a corporate family event in Los Angeles",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Corporate Family Event",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Happy Faces LA face painting in Glendale at a kids party",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Glendale",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Face painting designs for a party in Pasadena by Happy Faces LA",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Pasadena",
    featured: false,
    permissionConfirmed: true,
  },

  // Balloon Twisting — 4 entries
  {
    src: PLACEHOLDER,
    alt: "Happy Faces LA balloon twisting at a birthday party in Los Angeles",
    category: "Balloon Twisting",
    service: "Balloon Twisting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: true,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Balloon animals by Happy Faces LA at a school event in Los Angeles",
    category: "Balloon Twisting",
    service: "Balloon Twisting",
    eventType: "School Event",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Happy Faces LA balloon twisting at a festival in Los Angeles",
    category: "Balloon Twisting",
    service: "Balloon Twisting",
    eventType: "Festival",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Balloon twisting for a birthday party in Sherman Oaks by Happy Faces LA",
    category: "Balloon Twisting",
    service: "Balloon Twisting",
    eventType: "Birthday Party",
    location: "Sherman Oaks",
    featured: false,
    permissionConfirmed: true,
  },

  // Glitter Tattoos — 3 entries
  {
    src: PLACEHOLDER,
    alt: "Happy Faces LA glitter tattoos at a kids birthday party in Los Angeles",
    category: "Glitter Tattoos",
    service: "Glitter Tattoos",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: true,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Cosmetic-grade glitter tattoos by Happy Faces LA at a school carnival",
    category: "Glitter Tattoos",
    service: "Glitter Tattoos",
    eventType: "School Carnival",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Glitter tattoos for kids at a festival in Los Angeles by Happy Faces LA",
    category: "Glitter Tattoos",
    service: "Glitter Tattoos",
    eventType: "Festival",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },

  // Face Gems — 3 entries
  {
    src: PLACEHOLDER,
    alt: "Happy Faces LA face gems and face jewelry at a birthday party in Los Angeles",
    category: "Face Gems",
    service: "Face Gems & Face Jewelry",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: true,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Crystal face gems applied by Happy Faces LA at a themed party in Los Angeles",
    category: "Face Gems",
    service: "Face Gems & Face Jewelry",
    eventType: "Themed Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Face jewelry station at a kids event in Los Angeles by Happy Faces LA",
    category: "Face Gems",
    service: "Face Gems & Face Jewelry",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },

  // Event Atmosphere — 2 entries
  {
    src: PLACEHOLDER,
    alt: "Happy Faces LA entertainment setup at a birthday party in Los Angeles",
    category: "Event Atmosphere",
    service: "Event Entertainment",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Kids enjoying Happy Faces LA entertainment at a school carnival in Los Angeles",
    category: "Event Atmosphere",
    service: "Event Entertainment",
    eventType: "School Carnival",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },

  // Setup / Professional Kit — 2 entries
  {
    src: PLACEHOLDER,
    alt: "Happy Faces LA professional face painting kit and setup at a birthday party",
    category: "Setup",
    service: "Professional Setup",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: PLACEHOLDER,
    alt: "Happy Faces LA artist station and cosmetic supplies setup at an event",
    category: "Setup",
    service: "Professional Setup",
    eventType: "Event",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
];

export const galleryCategories: GalleryCategory[] = [
  "Face Painting",
  "Balloon Twisting",
  "Glitter Tattoos",
  "Face Gems",
  "Event Atmosphere",
  "Setup",
];
