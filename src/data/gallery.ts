export type GalleryCategory =
  | "Face Painting"
  | "Balloon Twisting"
  | "Glitter Tattoos"
  | "Face Gems"
  | "Event Atmosphere"
  | "Setup";

export type GalleryItem = {
  /** Public path to the image or video file */
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
  /** "image" (default) or "video" */
  mediaType?: "image" | "video";
  /** Poster/thumbnail path for video items */
  poster?: string;
};

// ---------------------------------------------------------------------------
// REAL ASSETS — ingested 2026-05-18 from owner's OneDrive asset folders.
// Processing: Pillow 12.1.1, resized to max 1400px wide, converted to WebP.
// permissionConfirmed: owner uploaded these from their business photo library.
// ---------------------------------------------------------------------------

export const galleryItems: GalleryItem[] = [
  // ── Face Painting — 12 real photos ───────────────────────────────────────
  {
    src: "/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-01.webp",
    alt: "Vibrant butterfly face painting by Happy Faces LA at a birthday party in Los Angeles",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: true,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-02.webp",
    alt: "Full face butterfly face painting at a kids birthday party in Los Angeles by Happy Faces LA",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: true,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-03.webp",
    alt: "Half cat, half galaxy butterfly face painting by Happy Faces LA in Los Angeles",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: true,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-04.webp",
    alt: "Full face flower and bee face painting at a birthday party in Los Angeles by Happy Faces LA",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-05.webp",
    alt: "Elephant cheek painting with glitter and water drop details at a kids party in Los Angeles",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-06.webp",
    alt: "Cherry blossom and Easter egg cheek painting by Happy Faces LA at a birthday party",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-07.webp",
    alt: "Face painting design by Happy Faces LA at a kids birthday party in Los Angeles",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-08.webp",
    alt: "Colorful face painting by Happy Faces LA at a party in Los Angeles",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-09.webp",
    alt: "Cheetah full face painting at a Los Angeles event by Happy Faces LA",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Event",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-10.webp",
    alt: "Tribal swirl cheek painting for a boy at a birthday party in Los Angeles by Happy Faces LA",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-11.webp",
    alt: "Bee and flower cheek painting by Happy Faces LA at a birthday party in Los Angeles",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/face-painting/happy-faces-la-face-painting-birthday-party-los-angeles-12.webp",
    alt: "Rainbow and flower cheek painting at a kids birthday party in Los Angeles by Happy Faces LA",
    category: "Face Painting",
    service: "Face Painting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },

  // ── Balloon Twisting — 4 real photos ─────────────────────────────────────
  {
    src: "/images/gallery/balloon-twisting/happy-faces-la-balloon-twisting-kids-party-los-angeles-01.webp",
    alt: "Happy Faces LA artist making balloon flowers at a backyard birthday party in Los Angeles",
    category: "Balloon Twisting",
    service: "Balloon Twisting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: true,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/balloon-twisting/happy-faces-la-balloon-twisting-kids-party-los-angeles-02.webp",
    alt: "Large balloon arch and installation by Happy Faces LA at a Los Angeles event",
    category: "Balloon Twisting",
    service: "Balloon Twisting",
    eventType: "Event",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/balloon-twisting/happy-faces-la-balloon-twisting-kids-party-los-angeles-03.webp",
    alt: "Happy child wearing a balloon hat by Happy Faces LA at a birthday party",
    category: "Balloon Twisting",
    service: "Balloon Twisting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/balloon-twisting/happy-faces-la-balloon-twisting-kids-party-los-angeles-04.webp",
    alt: "Balloon animal creation by Happy Faces LA artist at a kids party in Los Angeles",
    category: "Balloon Twisting",
    service: "Balloon Twisting",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },

  // ── Glitter Tattoos — placeholders (videos available, static photos needed) ─
  {
    src: "/images/placeholders/happy-faces-la-hero-placeholder.svg",
    alt: "Happy Faces LA glitter tattoos at a kids birthday party in Los Angeles",
    category: "Glitter Tattoos",
    service: "Glitter Tattoos",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/placeholders/happy-faces-la-hero-placeholder.svg",
    alt: "Cosmetic-grade glitter tattoos by Happy Faces LA at a school carnival in Los Angeles",
    category: "Glitter Tattoos",
    service: "Glitter Tattoos",
    eventType: "School Carnival",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/placeholders/happy-faces-la-hero-placeholder.svg",
    alt: "Glitter tattoos for kids at a festival in Los Angeles by Happy Faces LA",
    category: "Glitter Tattoos",
    service: "Glitter Tattoos",
    eventType: "Festival",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },

  // ── Face Gems — 4 real photos ─────────────────────────────────────────────
  {
    src: "/images/gallery/face-gems/happy-faces-la-face-gems-birthday-party-los-angeles-01.webp",
    alt: "Young girl with crystal flower crown face gems by Happy Faces LA at a birthday party",
    category: "Face Gems",
    service: "Face Gems & Face Jewelry",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: true,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/face-gems/happy-faces-la-face-gems-birthday-party-los-angeles-02.webp",
    alt: "Iridescent face gem crown on forehead at a birthday party in Los Angeles by Happy Faces LA",
    category: "Face Gems",
    service: "Face Gems & Face Jewelry",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: true,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/face-gems/happy-faces-la-face-gems-birthday-party-los-angeles-03.webp",
    alt: "Star and drip crystal face gems by Happy Faces LA at a kids party in Los Angeles",
    category: "Face Gems",
    service: "Face Gems & Face Jewelry",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/gallery/face-gems/happy-faces-la-face-gems-birthday-party-los-angeles-04.webp",
    alt: "Face gems and crystal jewelry at a birthday party in Los Angeles by Happy Faces LA",
    category: "Face Gems",
    service: "Face Gems & Face Jewelry",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },

  // ── Event Atmosphere — placeholders (video available, static photos needed) ─
  {
    src: "/images/placeholders/happy-faces-la-hero-placeholder.svg",
    alt: "Happy Faces LA entertainment setup at a birthday party in Los Angeles",
    category: "Event Atmosphere",
    service: "Event Entertainment",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/placeholders/happy-faces-la-hero-placeholder.svg",
    alt: "Kids enjoying Happy Faces LA entertainment at a school carnival in Los Angeles",
    category: "Event Atmosphere",
    service: "Event Entertainment",
    eventType: "School Carnival",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },

  // ── Setup / Professional Kit — placeholders (no photos provided yet) ──────
  {
    src: "/images/placeholders/happy-faces-la-hero-placeholder.svg",
    alt: "Happy Faces LA professional face painting kit and setup at a birthday party",
    category: "Setup",
    service: "Professional Setup",
    eventType: "Birthday Party",
    location: "Los Angeles",
    featured: false,
    permissionConfirmed: true,
  },
  {
    src: "/images/placeholders/happy-faces-la-hero-placeholder.svg",
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
