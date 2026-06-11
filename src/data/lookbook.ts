export type LookbookService = 'face-painting' | 'balloon-twisting' | 'face-gems';
export type LookbookSpeed = 'quick-designs' | 'classic-party' | 'premium-full-face' | 'balloon-favorites' | 'face-gems';

export interface LookbookSource {
  src: string;
  width: number;
}

export interface LookbookItem {
  slug: string;
  title: string;
  alt: string;
  service: LookbookService;
  serviceLabel: string;
  category: string;
  speed: LookbookSpeed;
  speedLabel: string;
  designStyle: string;
  prefill: {
    service: string;
    design_style: string;
    public_look_slug: string;
    public_look_title: string;
    category: string;
    inspiration_image_id: string;
  };
  image: {
    width: number;
    height: number;
    avif: LookbookSource[];
    webp: LookbookSource[];
    jpg: LookbookSource[];
    fallback: string;
    preview: string;
  };
}

export interface LookbookFilter {
  value: string;
  label: string;
}

export const lookbookItems: LookbookItem[] = [
  {
    "slug": "face-painting-001",
    "title": "Space Crewmate-Inspired Face Painting",
    "alt": "Space Crewmate-Inspired Face Painting by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "classic-party",
    "speedLabel": "Classic Party Designs",
    "designStyle": "standard-party",
    "prefill": {
      "service": "face-painting",
      "design_style": "standard-party",
      "public_look_slug": "face-painting-001",
      "public_look_title": "Space Crewmate-Inspired Face Painting",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-001"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-001-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-001-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-001-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-001-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-001-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-001-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-001-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-001-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-001-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-001.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-001.webp"
    }
  },
  {
    "slug": "face-painting-002",
    "title": "Space Crewmate-Inspired Rainbow Face Painting",
    "alt": "Space Crewmate-Inspired Rainbow Face Painting by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-002",
      "public_look_title": "Space Crewmate-Inspired Rainbow Face Painting",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-002"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-002-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-002-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-002-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-002-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-002-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-002-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-002-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-002-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-002-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-002.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-002.webp"
    }
  },
  {
    "slug": "face-painting-003",
    "title": "Mermaid-Inspired Cheek Art",
    "alt": "Mermaid-Inspired Cheek Art by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-003",
      "public_look_title": "Mermaid-Inspired Cheek Art",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-003"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-003-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-003-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-003-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-003-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-003-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-003-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-003-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-003-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-003-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-003.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-003.webp"
    }
  },
  {
    "slug": "face-painting-004",
    "title": "Blue Fantasy Full-Face Design",
    "alt": "Blue Fantasy Full-Face Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-004",
      "public_look_title": "Blue Fantasy Full-Face Design",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-004"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-004-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-004-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-004-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-004-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-004-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-004-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-004-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-004-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-004-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-004.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-004.webp"
    }
  },
  {
    "slug": "face-painting-005",
    "title": "Baby Elephant Water Spray Cheek Art",
    "alt": "Baby Elephant Water Spray Cheek Art by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Animals",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-005",
      "public_look_title": "Baby Elephant Water Spray Cheek Art",
      "category": "Animals",
      "inspiration_image_id": "face-painting-005"
    },
    "image": {
      "width": 2268,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-005-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-005-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-005-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-005-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-005-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-005-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-005-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-005-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-005-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-005-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-005-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-005-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-005.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-005.webp"
    }
  },
  {
    "slug": "face-painting-006",
    "title": "Black Tribal Swirl Eye Design",
    "alt": "Black Tribal Swirl Eye Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Classic Designs",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-006",
      "public_look_title": "Black Tribal Swirl Eye Design",
      "category": "Classic Designs",
      "inspiration_image_id": "face-painting-006"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-006-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-006-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-006-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-006-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-006-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-006-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-006-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-006-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-006-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-006-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-006-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-006-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-006.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-006.webp"
    }
  },
  {
    "slug": "face-painting-007",
    "title": "Blue Superhero Mask Full-Face Design",
    "alt": "Blue Superhero Mask Full-Face Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-007",
      "public_look_title": "Blue Superhero Mask Full-Face Design",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-007"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-007-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-007-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-007-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-007-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-007-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-007-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-007-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-007-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-007-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-007-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-007-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-007-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-007.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-007.webp"
    }
  },
  {
    "slug": "face-painting-008",
    "title": "Blue Tiger Half Face with Cat Whiskers",
    "alt": "Blue Tiger Half Face with Cat Whiskers by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Animals",
    "speed": "classic-party",
    "speedLabel": "Classic Party Designs",
    "designStyle": "standard-party",
    "prefill": {
      "service": "face-painting",
      "design_style": "standard-party",
      "public_look_slug": "face-painting-008",
      "public_look_title": "Blue Tiger Half Face with Cat Whiskers",
      "category": "Animals",
      "inspiration_image_id": "face-painting-008"
    },
    "image": {
      "width": 2268,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-008-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-008-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-008-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-008-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-008-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-008-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-008-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-008-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-008-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-008-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-008-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-008-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-008.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-008.webp"
    }
  },
  {
    "slug": "face-painting-009",
    "title": "Bunny with Rainbow and Flowers Cheek Art",
    "alt": "Bunny with Rainbow and Flowers Cheek Art by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Animals",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-009",
      "public_look_title": "Bunny with Rainbow and Flowers Cheek Art",
      "category": "Animals",
      "inspiration_image_id": "face-painting-009"
    },
    "image": {
      "width": 1583,
      "height": 2813,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-009-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-009-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-009-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-009-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-009-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-009-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-009-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-009-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-009-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-009-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-009-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-009-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-009.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-009.webp"
    }
  },
  {
    "slug": "face-painting-010",
    "title": "Butterfly Full-Face Design Purple and Pink",
    "alt": "Butterfly Full-Face Design Purple and Pink by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Fantasy",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-010",
      "public_look_title": "Butterfly Full-Face Design Purple and Pink",
      "category": "Fantasy",
      "inspiration_image_id": "face-painting-010"
    },
    "image": {
      "width": 1722,
      "height": 3061,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-010-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-010-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-010-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-010-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-010-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-010-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-010-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-010-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-010-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-010-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-010-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-010-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-010.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-010.webp"
    }
  },
  {
    "slug": "face-painting-011",
    "title": "Catrina Dia de los Muertos Dark Glam Full-Face Design",
    "alt": "Catrina Dia de los Muertos Dark Glam Full-Face Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Seasonal",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-011",
      "public_look_title": "Catrina Dia de los Muertos Dark Glam Full-Face Design",
      "category": "Seasonal",
      "inspiration_image_id": "face-painting-011"
    },
    "image": {
      "width": 1170,
      "height": 1740,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-011-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-011-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-011-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-011-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-011-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-011-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-011-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-011-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-011-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-011.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-011.webp"
    }
  },
  {
    "slug": "face-painting-012",
    "title": "Catrina Dia de los Muertos Full-Face Design Black and Red",
    "alt": "Catrina Dia de los Muertos Full-Face Design Black and Red by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Seasonal",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-012",
      "public_look_title": "Catrina Dia de los Muertos Full-Face Design Black and Red",
      "category": "Seasonal",
      "inspiration_image_id": "face-painting-012"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-012-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-012-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-012-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-012-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-012-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-012-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-012-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-012-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-012-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-012.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-012.webp"
    }
  },
  {
    "slug": "face-painting-013",
    "title": "Catrina Dia de los Muertos Half Face Blue",
    "alt": "Catrina Dia de los Muertos Half Face Blue by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Seasonal",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-013",
      "public_look_title": "Catrina Dia de los Muertos Half Face Blue",
      "category": "Seasonal",
      "inspiration_image_id": "face-painting-013"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-013-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-013-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-013-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-013-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-013-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-013-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-013-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-013-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-013-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-013.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-013.webp"
    }
  },
  {
    "slug": "face-painting-014",
    "title": "Christmas Lights Forehead",
    "alt": "Christmas Lights Forehead by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Seasonal",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-014",
      "public_look_title": "Christmas Lights Forehead",
      "category": "Seasonal",
      "inspiration_image_id": "face-painting-014"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-014-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-014-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-014-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-014-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-014-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-014-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-014-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-014-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-014-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-014.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-014.webp"
    }
  },
  {
    "slug": "face-painting-015",
    "title": "Christmas Lights Forehead",
    "alt": "Christmas Lights Forehead by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Seasonal",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-015",
      "public_look_title": "Christmas Lights Forehead",
      "category": "Seasonal",
      "inspiration_image_id": "face-painting-015"
    },
    "image": {
      "width": 1600,
      "height": 1200,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-015-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-015-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-015-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-015-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-015-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-015-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-015-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-015-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-015-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-015-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-015-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-015-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-015.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-015.webp"
    }
  },
  {
    "slug": "face-painting-016",
    "title": "Classic Circus Clown",
    "alt": "Classic Circus Clown by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Classic Designs",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-016",
      "public_look_title": "Classic Circus Clown",
      "category": "Classic Designs",
      "inspiration_image_id": "face-painting-016"
    },
    "image": {
      "width": 960,
      "height": 1280,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-016-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-016-768.avif",
          "width": 768
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-016-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-016-768.webp",
          "width": 768
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-016-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-016-768.jpg",
          "width": 768
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-016.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-016.webp"
    }
  },
  {
    "slug": "face-painting-017",
    "title": "Black and White Villain-Inspired Character Makeup",
    "alt": "Black and White Villain-Inspired Character Makeup by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "classic-party",
    "speedLabel": "Classic Party Designs",
    "designStyle": "standard-party",
    "prefill": {
      "service": "face-painting",
      "design_style": "standard-party",
      "public_look_slug": "face-painting-017",
      "public_look_title": "Black and White Villain-Inspired Character Makeup",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-017"
    },
    "image": {
      "width": 1170,
      "height": 1547,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-017-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-017-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-017-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-017-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-017-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-017-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-017-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-017-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-017-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-017.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-017.webp"
    }
  },
  {
    "slug": "face-painting-018",
    "title": "Easter Bunny with Rainbow",
    "alt": "Easter Bunny with Rainbow by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Animals",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-018",
      "public_look_title": "Easter Bunny with Rainbow",
      "category": "Animals",
      "inspiration_image_id": "face-painting-018"
    },
    "image": {
      "width": 1726,
      "height": 3068,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-018-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-018-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-018-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-018-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-018-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-018-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-018-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-018-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-018-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-018-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-018-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-018-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-018.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-018.webp"
    }
  },
  {
    "slug": "face-painting-019",
    "title": "Easter Eggs with Cherry Blossom Flowers",
    "alt": "Easter Eggs with Cherry Blossom Flowers by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Classic Designs",
    "speed": "classic-party",
    "speedLabel": "Classic Party Designs",
    "designStyle": "standard-party",
    "prefill": {
      "service": "face-painting",
      "design_style": "standard-party",
      "public_look_slug": "face-painting-019",
      "public_look_title": "Easter Eggs with Cherry Blossom Flowers",
      "category": "Classic Designs",
      "inspiration_image_id": "face-painting-019"
    },
    "image": {
      "width": 1805,
      "height": 3209,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-019-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-019-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-019-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-019-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-019-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-019-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-019-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-019-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-019-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-019-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-019-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-019-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-019.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-019.webp"
    }
  },
  {
    "slug": "face-painting-020",
    "title": "Fairy Butterfly Eye Design",
    "alt": "Fairy Butterfly Eye Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Fantasy",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-020",
      "public_look_title": "Fairy Butterfly Eye Design",
      "category": "Fantasy",
      "inspiration_image_id": "face-painting-020"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-020-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-020-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-020-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-020-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-020-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-020-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-020-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-020-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-020-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-020.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-020.webp"
    }
  },
  {
    "slug": "face-painting-021",
    "title": "Fairy Butterfly Eye Design",
    "alt": "Fairy Butterfly Eye Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Fantasy",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-021",
      "public_look_title": "Fairy Butterfly Eye Design",
      "category": "Fantasy",
      "inspiration_image_id": "face-painting-021"
    },
    "image": {
      "width": 960,
      "height": 1280,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-021-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-021-768.avif",
          "width": 768
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-021-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-021-768.webp",
          "width": 768
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-021-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-021-768.jpg",
          "width": 768
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-021.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-021.webp"
    }
  },
  {
    "slug": "face-painting-022",
    "title": "Green Cheetah Half Face",
    "alt": "Green Cheetah Half Face by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Animals",
    "speed": "classic-party",
    "speedLabel": "Classic Party Designs",
    "designStyle": "standard-party",
    "prefill": {
      "service": "face-painting",
      "design_style": "standard-party",
      "public_look_slug": "face-painting-022",
      "public_look_title": "Green Cheetah Half Face",
      "category": "Animals",
      "inspiration_image_id": "face-painting-022"
    },
    "image": {
      "width": 1442,
      "height": 2564,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-022-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-022-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-022-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-022-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-022-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-022-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-022-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-022-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-022-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-022-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-022-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-022-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-022.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-022.webp"
    }
  },
  {
    "slug": "face-painting-023",
    "title": "Green Octopus Eye Design",
    "alt": "Green Octopus Eye Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Animals",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-023",
      "public_look_title": "Green Octopus Eye Design",
      "category": "Animals",
      "inspiration_image_id": "face-painting-023"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-023-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-023-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-023-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-023-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-023-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-023-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-023-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-023-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-023-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-023.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-023.webp"
    }
  },
  {
    "slug": "face-painting-024",
    "title": "Halloween Ghost Cheek Art",
    "alt": "Halloween Ghost Cheek Art by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Seasonal",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-024",
      "public_look_title": "Halloween Ghost Cheek Art",
      "category": "Seasonal",
      "inspiration_image_id": "face-painting-024"
    },
    "image": {
      "width": 1161,
      "height": 1490,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-024-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-024-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-024-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-024-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-024-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-024-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-024-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-024-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-024-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-024.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-024.webp"
    }
  },
  {
    "slug": "face-painting-025",
    "title": "Halloween Jack-o-Lantern Full-Face Design",
    "alt": "Halloween Jack-o-Lantern Full-Face Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Seasonal",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-025",
      "public_look_title": "Halloween Jack-o-Lantern Full-Face Design",
      "category": "Seasonal",
      "inspiration_image_id": "face-painting-025"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-025-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-025-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-025-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-025-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-025-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-025-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-025-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-025-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-025-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-025.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-025.webp"
    }
  },
  {
    "slug": "face-painting-026",
    "title": "Halloween Zombie Full-Face Design",
    "alt": "Halloween Zombie Full-Face Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Seasonal",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-026",
      "public_look_title": "Halloween Zombie Full-Face Design",
      "category": "Seasonal",
      "inspiration_image_id": "face-painting-026"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-026-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-026-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-026-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-026-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-026-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-026-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-026-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-026-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-026-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-026.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-026.webp"
    }
  },
  {
    "slug": "face-painting-027",
    "title": "Halloween Zombie Full-Face Design",
    "alt": "Halloween Zombie Full-Face Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Seasonal",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-027",
      "public_look_title": "Halloween Zombie Full-Face Design",
      "category": "Seasonal",
      "inspiration_image_id": "face-painting-027"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-027-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-027-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-027-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-027-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-027-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-027-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-027-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-027-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-027-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-027.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-027.webp"
    }
  },
  {
    "slug": "face-painting-028",
    "title": "Pink Bow Kitty-Inspired Cheek Art",
    "alt": "Pink Bow Kitty-Inspired Cheek Art by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-028",
      "public_look_title": "Pink Bow Kitty-Inspired Cheek Art",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-028"
    },
    "image": {
      "width": 960,
      "height": 1280,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-028-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-028-768.avif",
          "width": 768
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-028-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-028-768.webp",
          "width": 768
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-028-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-028-768.jpg",
          "width": 768
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-028.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-028.webp"
    }
  },
  {
    "slug": "face-painting-029",
    "title": "Honeybee with Rainbow and Flowers",
    "alt": "Honeybee with Rainbow and Flowers by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Animals",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-029",
      "public_look_title": "Honeybee with Rainbow and Flowers",
      "category": "Animals",
      "inspiration_image_id": "face-painting-029"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-029-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-029-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-029-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-029-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-029-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-029-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-029-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-029-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-029-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-029-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-029-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-029-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-029.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-029.webp"
    }
  },
  {
    "slug": "face-painting-030",
    "title": "Blocky Video Game-Inspired Full-Face Design",
    "alt": "Blocky Video Game-Inspired Full-Face Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-030",
      "public_look_title": "Blocky Video Game-Inspired Full-Face Design",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-030"
    },
    "image": {
      "width": 900,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-030-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-030-768.avif",
          "width": 768
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-030-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-030-768.webp",
          "width": 768
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-030-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-030-768.jpg",
          "width": 768
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-030.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-030.webp"
    }
  },
  {
    "slug": "face-painting-031",
    "title": "Yellow Cartoon-Inspired Cheek Art",
    "alt": "Yellow Cartoon-Inspired Cheek Art by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-031",
      "public_look_title": "Yellow Cartoon-Inspired Cheek Art",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-031"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-031-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-031-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-031-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-031-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-031-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-031-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-031-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-031-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-031-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-031-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-031-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-031-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-031.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-031.webp"
    }
  },
  {
    "slug": "face-painting-032",
    "title": "Pink and Blue Superhero Mask with Glitter",
    "alt": "Pink and Blue Superhero Mask with Glitter by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-032",
      "public_look_title": "Pink and Blue Superhero Mask with Glitter",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-032"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-032-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-032-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-032-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-032-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-032-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-032-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-032-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-032-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-032-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-032-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-032-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-032-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-032.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-032.webp"
    }
  },
  {
    "slug": "face-painting-033",
    "title": "Silly Emoji-Inspired Cheek Art",
    "alt": "Silly Emoji-Inspired Cheek Art by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Cheek Art",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-033",
      "public_look_title": "Silly Emoji-Inspired Cheek Art",
      "category": "Cheek Art",
      "inspiration_image_id": "face-painting-033"
    },
    "image": {
      "width": 900,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-033-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-033-768.avif",
          "width": 768
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-033-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-033-768.webp",
          "width": 768
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-033-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-033-768.jpg",
          "width": 768
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-033.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-033.webp"
    }
  },
  {
    "slug": "face-painting-034",
    "title": "Purple Octopus Cheek Art",
    "alt": "Purple Octopus Cheek Art by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Animals",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-034",
      "public_look_title": "Purple Octopus Cheek Art",
      "category": "Animals",
      "inspiration_image_id": "face-painting-034"
    },
    "image": {
      "width": 2268,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-034-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-034-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-034-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-034-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-034-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-034-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-034-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-034-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-034-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-034-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-034-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-034-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-034.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-034.webp"
    }
  },
  {
    "slug": "face-painting-035",
    "title": "Rainbow Butterfly Eye Design with Glitter",
    "alt": "Rainbow Butterfly Eye Design with Glitter by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Fantasy",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-035",
      "public_look_title": "Rainbow Butterfly Eye Design with Glitter",
      "category": "Fantasy",
      "inspiration_image_id": "face-painting-035"
    },
    "image": {
      "width": 627,
      "height": 836,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-035-480.avif",
          "width": 480
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-035-480.webp",
          "width": 480
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-035-480.jpg",
          "width": 480
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-035.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-035.webp"
    }
  },
  {
    "slug": "face-painting-036",
    "title": "Rainbow Butterfly Full-Face Design with Black Wing Detail",
    "alt": "Rainbow Butterfly Full-Face Design with Black Wing Detail by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Fantasy",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-036",
      "public_look_title": "Rainbow Butterfly Full-Face Design with Black Wing Detail",
      "category": "Fantasy",
      "inspiration_image_id": "face-painting-036"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036.webp"
    }
  },
  {
    "slug": "face-painting-037",
    "title": "Rainbow Unicorn Full-Face Design with Glitter and Flowers",
    "alt": "Rainbow Unicorn Full-Face Design with Glitter and Flowers by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Fantasy",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-037",
      "public_look_title": "Rainbow Unicorn Full-Face Design with Glitter and Flowers",
      "category": "Fantasy",
      "inspiration_image_id": "face-painting-037"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-037-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-037-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-037-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-037-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-037-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-037-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-037-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-037-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-037-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-037-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-037-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-037-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-037.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-037.webp"
    }
  },
  {
    "slug": "face-painting-038",
    "title": "Rainbow Unicorn Full-Face Design with Glitter and Flowers",
    "alt": "Rainbow Unicorn Full-Face Design with Glitter and Flowers by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Fantasy",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-038",
      "public_look_title": "Rainbow Unicorn Full-Face Design with Glitter and Flowers",
      "category": "Fantasy",
      "inspiration_image_id": "face-painting-038"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-038-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-038-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-038-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-038-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-038-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-038-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-038-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-038-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-038-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-038-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-038-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-038-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-038.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-038.webp"
    }
  },
  {
    "slug": "face-painting-039",
    "title": "Rainbow Unicorn Full-Face Design with Glitter and Flowers",
    "alt": "Rainbow Unicorn Full-Face Design with Glitter and Flowers by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Fantasy",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-039",
      "public_look_title": "Rainbow Unicorn Full-Face Design with Glitter and Flowers",
      "category": "Fantasy",
      "inspiration_image_id": "face-painting-039"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-039-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-039-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-039-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-039-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-039-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-039-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-039-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-039-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-039-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-039-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-039-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-039-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-039.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-039.webp"
    }
  },
  {
    "slug": "face-painting-040",
    "title": "Rainbow",
    "alt": "Rainbow by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Classic Designs",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-040",
      "public_look_title": "Rainbow",
      "category": "Classic Designs",
      "inspiration_image_id": "face-painting-040"
    },
    "image": {
      "width": 2268,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-040-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-040-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-040-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-040-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-040-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-040-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-040-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-040-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-040-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-040-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-040-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-040-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-040.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-040.webp"
    }
  },
  {
    "slug": "face-painting-041",
    "title": "Red Superhero Mask Full-Face Design",
    "alt": "Red Superhero Mask Full-Face Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-041",
      "public_look_title": "Red Superhero Mask Full-Face Design",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-041"
    },
    "image": {
      "width": 959,
      "height": 1280,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-041-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-041-768.avif",
          "width": 768
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-041-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-041-768.webp",
          "width": 768
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-041-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-041-768.jpg",
          "width": 768
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-041.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-041.webp"
    }
  },
  {
    "slug": "face-painting-042",
    "title": "Red Superhero Mask Full-Face Design",
    "alt": "Red Superhero Mask Full-Face Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-042",
      "public_look_title": "Red Superhero Mask Full-Face Design",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-042"
    },
    "image": {
      "width": 960,
      "height": 1280,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-042-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-042-768.avif",
          "width": 768
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-042-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-042-768.webp",
          "width": 768
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-042-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-042-768.jpg",
          "width": 768
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-042.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-042.webp"
    }
  },
  {
    "slug": "face-painting-043",
    "title": "Superhero Web Eye Cheek Art",
    "alt": "Superhero Web Eye Cheek Art by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-043",
      "public_look_title": "Superhero Web Eye Cheek Art",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-043"
    },
    "image": {
      "width": 960,
      "height": 1280,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-043-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-043-768.avif",
          "width": 768
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-043-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-043-768.webp",
          "width": 768
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-043-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-043-768.jpg",
          "width": 768
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-043.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-043.webp"
    }
  },
  {
    "slug": "face-painting-044",
    "title": "Red Mushroom-Inspired Cheek Art with Rainbow",
    "alt": "Red Mushroom-Inspired Cheek Art with Rainbow by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "quick-designs",
    "speedLabel": "Quick Designs / Fast Event Menu",
    "designStyle": "quick-cheek-arm",
    "prefill": {
      "service": "face-painting",
      "design_style": "quick-cheek-arm",
      "public_look_slug": "face-painting-044",
      "public_look_title": "Red Mushroom-Inspired Cheek Art with Rainbow",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-044"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-044-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-044-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-044-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-044-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-044-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-044-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-044-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-044-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-044-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-044.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-044.webp"
    }
  },
  {
    "slug": "face-painting-045",
    "title": "Green Holiday Character-Inspired Full-Face Design",
    "alt": "Green Holiday Character-Inspired Full-Face Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-045",
      "public_look_title": "Green Holiday Character-Inspired Full-Face Design",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-045"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-045-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-045-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-045-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-045-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-045-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-045-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-045-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-045-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-045-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-045.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-045.webp"
    }
  },
  {
    "slug": "face-painting-046",
    "title": "Triceratops Dinosaur Full-Face Design",
    "alt": "Triceratops Dinosaur Full-Face Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Animals",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-046",
      "public_look_title": "Triceratops Dinosaur Full-Face Design",
      "category": "Animals",
      "inspiration_image_id": "face-painting-046"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-046-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-046-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-046-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-046-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-046-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-046-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-046-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-046-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-046-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-046.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-046.webp"
    }
  },
  {
    "slug": "face-painting-047",
    "title": "Yellow Superhero Mask Full-Face Design",
    "alt": "Yellow Superhero Mask Full-Face Design by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Character-Inspired",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-047",
      "public_look_title": "Yellow Superhero Mask Full-Face Design",
      "category": "Character-Inspired",
      "inspiration_image_id": "face-painting-047"
    },
    "image": {
      "width": 1200,
      "height": 1600,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-047-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-047-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-047-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-047-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-047-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-047-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-047-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-047-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-047-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-047.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-047.webp"
    }
  },
  {
    "slug": "face-painting-048",
    "title": "Zipper Illusion Half Face Glam",
    "alt": "Zipper Illusion Half Face Glam by Happy Faces LA.",
    "service": "face-painting",
    "serviceLabel": "Face Painting",
    "category": "Classic Designs",
    "speed": "premium-full-face",
    "speedLabel": "Premium / Full-Face Designs",
    "designStyle": "full-face",
    "prefill": {
      "service": "face-painting",
      "design_style": "full-face",
      "public_look_slug": "face-painting-048",
      "public_look_title": "Zipper Illusion Half Face Glam",
      "category": "Classic Designs",
      "inspiration_image_id": "face-painting-048"
    },
    "image": {
      "width": 1170,
      "height": 1312,
      "avif": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-048-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-048-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-048-1024.avif",
          "width": 1024
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-048-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-048-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-048-1024.webp",
          "width": 1024
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-048-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-048-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-048-1024.jpg",
          "width": 1024
        }
      ],
      "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-048.jpg",
      "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-048.webp"
    }
  },
  {
    "slug": "balloon-twisting-001",
    "title": "Balloon Artist Table",
    "alt": "Balloon Artist Table by Happy Faces LA.",
    "service": "balloon-twisting",
    "serviceLabel": "Balloon Twisting",
    "category": "Balloon Favorites",
    "speed": "balloon-favorites",
    "speedLabel": "Balloon Favorites",
    "designStyle": "not-sure",
    "prefill": {
      "service": "balloon-twisting",
      "design_style": "not-sure",
      "public_look_slug": "balloon-twisting-001",
      "public_look_title": "Balloon Artist Table",
      "category": "Balloon Favorites",
      "inspiration_image_id": "balloon-twisting-001"
    },
    "image": {
      "width": 4284,
      "height": 5712,
      "avif": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-001-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-001-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-001-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-001-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-001-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-001-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-001-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-001-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-001-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-001-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-001-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-001-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-001.jpg",
      "preview": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-001.webp"
    }
  },
  {
    "slug": "balloon-twisting-002",
    "title": "Balloon Flower Bouquet",
    "alt": "Balloon Flower Bouquet by Happy Faces LA.",
    "service": "balloon-twisting",
    "serviceLabel": "Balloon Twisting",
    "category": "Balloon Flowers",
    "speed": "balloon-favorites",
    "speedLabel": "Balloon Favorites",
    "designStyle": "not-sure",
    "prefill": {
      "service": "balloon-twisting",
      "design_style": "not-sure",
      "public_look_slug": "balloon-twisting-002",
      "public_look_title": "Balloon Flower Bouquet",
      "category": "Balloon Flowers",
      "inspiration_image_id": "balloon-twisting-002"
    },
    "image": {
      "width": 2268,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-002-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-002-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-002-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-002-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-002-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-002-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-002-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-002-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-002-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-002-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-002-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-002-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-002.jpg",
      "preview": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-002.webp"
    }
  },
  {
    "slug": "balloon-twisting-003",
    "title": "Blue Balloon Animal",
    "alt": "Blue Balloon Animal by Happy Faces LA.",
    "service": "balloon-twisting",
    "serviceLabel": "Balloon Twisting",
    "category": "Balloon Animals",
    "speed": "balloon-favorites",
    "speedLabel": "Balloon Favorites",
    "designStyle": "not-sure",
    "prefill": {
      "service": "balloon-twisting",
      "design_style": "not-sure",
      "public_look_slug": "balloon-twisting-003",
      "public_look_title": "Blue Balloon Animal",
      "category": "Balloon Animals",
      "inspiration_image_id": "balloon-twisting-003"
    },
    "image": {
      "width": 2268,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-003-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-003-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-003-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-003-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-003-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-003-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-003-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-003-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-003-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-003-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-003-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-003-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-003.jpg",
      "preview": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-003.webp"
    }
  },
  {
    "slug": "balloon-twisting-004",
    "title": "Green and Blue Balloon Swords",
    "alt": "Green and Blue Balloon Swords by Happy Faces LA.",
    "service": "balloon-twisting",
    "serviceLabel": "Balloon Twisting",
    "category": "Balloon Swords",
    "speed": "balloon-favorites",
    "speedLabel": "Balloon Favorites",
    "designStyle": "not-sure",
    "prefill": {
      "service": "balloon-twisting",
      "design_style": "not-sure",
      "public_look_slug": "balloon-twisting-004",
      "public_look_title": "Green and Blue Balloon Swords",
      "category": "Balloon Swords",
      "inspiration_image_id": "balloon-twisting-004"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-004-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-004-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-004-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-004-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-004-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-004-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-004-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-004-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-004-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-004-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-004-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-004-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-004.jpg",
      "preview": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-004.webp"
    }
  },
  {
    "slug": "balloon-twisting-005",
    "title": "Green Balloon Animal",
    "alt": "Green Balloon Animal by Happy Faces LA.",
    "service": "balloon-twisting",
    "serviceLabel": "Balloon Twisting",
    "category": "Balloon Animals",
    "speed": "balloon-favorites",
    "speedLabel": "Balloon Favorites",
    "designStyle": "not-sure",
    "prefill": {
      "service": "balloon-twisting",
      "design_style": "not-sure",
      "public_look_slug": "balloon-twisting-005",
      "public_look_title": "Green Balloon Animal",
      "category": "Balloon Animals",
      "inspiration_image_id": "balloon-twisting-005"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-005-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-005-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-005-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-005-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-005-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-005-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-005-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-005-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-005-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-005-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-005-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-005-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-005.jpg",
      "preview": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-005.webp"
    }
  },
  {
    "slug": "balloon-twisting-006",
    "title": "Green Balloon Sword",
    "alt": "Green Balloon Sword by Happy Faces LA.",
    "service": "balloon-twisting",
    "serviceLabel": "Balloon Twisting",
    "category": "Balloon Swords",
    "speed": "balloon-favorites",
    "speedLabel": "Balloon Favorites",
    "designStyle": "not-sure",
    "prefill": {
      "service": "balloon-twisting",
      "design_style": "not-sure",
      "public_look_slug": "balloon-twisting-006",
      "public_look_title": "Green Balloon Sword",
      "category": "Balloon Swords",
      "inspiration_image_id": "balloon-twisting-006"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-006-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-006-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-006-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-006-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-006-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-006-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-006-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-006-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-006-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-006-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-006-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-006-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-006.jpg",
      "preview": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-006.webp"
    }
  },
  {
    "slug": "balloon-twisting-007",
    "title": "Green Yellow Balloon Hat Character",
    "alt": "Green Yellow Balloon Hat Character by Happy Faces LA.",
    "service": "balloon-twisting",
    "serviceLabel": "Balloon Twisting",
    "category": "Balloon Hats",
    "speed": "balloon-favorites",
    "speedLabel": "Balloon Favorites",
    "designStyle": "not-sure",
    "prefill": {
      "service": "balloon-twisting",
      "design_style": "not-sure",
      "public_look_slug": "balloon-twisting-007",
      "public_look_title": "Green Yellow Balloon Hat Character",
      "category": "Balloon Hats",
      "inspiration_image_id": "balloon-twisting-007"
    },
    "image": {
      "width": 955,
      "height": 1747,
      "avif": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-007-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-007-768.avif",
          "width": 768
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-007-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-007-768.webp",
          "width": 768
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-007-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-007-768.jpg",
          "width": 768
        }
      ],
      "fallback": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-007.jpg",
      "preview": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-007.webp"
    }
  },
  {
    "slug": "balloon-twisting-008",
    "title": "Pink and Yellow Balloon Animals",
    "alt": "Pink and Yellow Balloon Animals by Happy Faces LA.",
    "service": "balloon-twisting",
    "serviceLabel": "Balloon Twisting",
    "category": "Balloon Animals",
    "speed": "balloon-favorites",
    "speedLabel": "Balloon Favorites",
    "designStyle": "not-sure",
    "prefill": {
      "service": "balloon-twisting",
      "design_style": "not-sure",
      "public_look_slug": "balloon-twisting-008",
      "public_look_title": "Pink and Yellow Balloon Animals",
      "category": "Balloon Animals",
      "inspiration_image_id": "balloon-twisting-008"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-008-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-008-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-008-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-008-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-008-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-008-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-008-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-008-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-008-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-008-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-008-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-008-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-008.jpg",
      "preview": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-008.webp"
    }
  },
  {
    "slug": "balloon-twisting-009",
    "title": "Pink Balloon Flower",
    "alt": "Pink Balloon Flower by Happy Faces LA.",
    "service": "balloon-twisting",
    "serviceLabel": "Balloon Twisting",
    "category": "Balloon Flowers",
    "speed": "balloon-favorites",
    "speedLabel": "Balloon Favorites",
    "designStyle": "not-sure",
    "prefill": {
      "service": "balloon-twisting",
      "design_style": "not-sure",
      "public_look_slug": "balloon-twisting-009",
      "public_look_title": "Pink Balloon Flower",
      "category": "Balloon Flowers",
      "inspiration_image_id": "balloon-twisting-009"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-009-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-009-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-009-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-009-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-009-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-009-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-009-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-009-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-009-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-009-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-009-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-009-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-009.jpg",
      "preview": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-009.webp"
    }
  },
  {
    "slug": "balloon-twisting-010",
    "title": "Purple Balloon Animal",
    "alt": "Purple Balloon Animal by Happy Faces LA.",
    "service": "balloon-twisting",
    "serviceLabel": "Balloon Twisting",
    "category": "Balloon Animals",
    "speed": "balloon-favorites",
    "speedLabel": "Balloon Favorites",
    "designStyle": "not-sure",
    "prefill": {
      "service": "balloon-twisting",
      "design_style": "not-sure",
      "public_look_slug": "balloon-twisting-010",
      "public_look_title": "Purple Balloon Animal",
      "category": "Balloon Animals",
      "inspiration_image_id": "balloon-twisting-010"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-010-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-010-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-010-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-010-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-010-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-010-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-010-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-010-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-010-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-010-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-010-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-010-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-010.jpg",
      "preview": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-010.webp"
    }
  },
  {
    "slug": "balloon-twisting-011",
    "title": "Red Balloon Sword",
    "alt": "Red Balloon Sword by Happy Faces LA.",
    "service": "balloon-twisting",
    "serviceLabel": "Balloon Twisting",
    "category": "Balloon Swords",
    "speed": "balloon-favorites",
    "speedLabel": "Balloon Favorites",
    "designStyle": "not-sure",
    "prefill": {
      "service": "balloon-twisting",
      "design_style": "not-sure",
      "public_look_slug": "balloon-twisting-011",
      "public_look_title": "Red Balloon Sword",
      "category": "Balloon Swords",
      "inspiration_image_id": "balloon-twisting-011"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-011-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-011-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-011-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-011-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-011-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-011-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-011-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-011-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-011-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-011-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-011-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-011-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-011.jpg",
      "preview": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-011.webp"
    }
  },
  {
    "slug": "balloon-twisting-012",
    "title": "White Balloon Sword",
    "alt": "White Balloon Sword by Happy Faces LA.",
    "service": "balloon-twisting",
    "serviceLabel": "Balloon Twisting",
    "category": "Balloon Swords",
    "speed": "balloon-favorites",
    "speedLabel": "Balloon Favorites",
    "designStyle": "not-sure",
    "prefill": {
      "service": "balloon-twisting",
      "design_style": "not-sure",
      "public_look_slug": "balloon-twisting-012",
      "public_look_title": "White Balloon Sword",
      "category": "Balloon Swords",
      "inspiration_image_id": "balloon-twisting-012"
    },
    "image": {
      "width": 2268,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-012-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-012-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-012-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-012-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-012-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-012-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-012-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-012-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-012-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-012-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-012-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-012-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-012.jpg",
      "preview": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-012.webp"
    }
  },
  {
    "slug": "balloon-twisting-013",
    "title": "Yellow Balloon Sword",
    "alt": "Yellow Balloon Sword by Happy Faces LA.",
    "service": "balloon-twisting",
    "serviceLabel": "Balloon Twisting",
    "category": "Balloon Swords",
    "speed": "balloon-favorites",
    "speedLabel": "Balloon Favorites",
    "designStyle": "not-sure",
    "prefill": {
      "service": "balloon-twisting",
      "design_style": "not-sure",
      "public_look_slug": "balloon-twisting-013",
      "public_look_title": "Yellow Balloon Sword",
      "category": "Balloon Swords",
      "inspiration_image_id": "balloon-twisting-013"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-013-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-013-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-013-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-013-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-013-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-013-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-013-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-013-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-013-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-013-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-013-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-013-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-013.jpg",
      "preview": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-013.webp"
    }
  },
  {
    "slug": "balloon-twisting-014",
    "title": "Yellow Balloon Sword",
    "alt": "Yellow Balloon Sword by Happy Faces LA.",
    "service": "balloon-twisting",
    "serviceLabel": "Balloon Twisting",
    "category": "Balloon Swords",
    "speed": "balloon-favorites",
    "speedLabel": "Balloon Favorites",
    "designStyle": "not-sure",
    "prefill": {
      "service": "balloon-twisting",
      "design_style": "not-sure",
      "public_look_slug": "balloon-twisting-014",
      "public_look_title": "Yellow Balloon Sword",
      "category": "Balloon Swords",
      "inspiration_image_id": "balloon-twisting-014"
    },
    "image": {
      "width": 3024,
      "height": 4032,
      "avif": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-014-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-014-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-014-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-014-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-014-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-014-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-014-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-014-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-014-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-014-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-014-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-014-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-014.jpg",
      "preview": "/images/party-lookbook/balloon-twisting/happy-faces-la-balloon-twisting-014.webp"
    }
  },
  {
    "slug": "face-gems-001",
    "title": "Forehead Gem Crown Black and Iridescent Crystals",
    "alt": "Forehead Gem Crown Black and Iridescent Crystals by Happy Faces LA.",
    "service": "face-gems",
    "serviceLabel": "Face Gems",
    "category": "Face Gems",
    "speed": "face-gems",
    "speedLabel": "Face Gems",
    "designStyle": "not-sure",
    "prefill": {
      "service": "face-gems",
      "design_style": "not-sure",
      "public_look_slug": "face-gems-001",
      "public_look_title": "Forehead Gem Crown Black and Iridescent Crystals",
      "category": "Face Gems",
      "inspiration_image_id": "face-gems-001"
    },
    "image": {
      "width": 2143,
      "height": 2143,
      "avif": [
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-001-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-001-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-001-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-001-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-001-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-001-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-001-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-001-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-001-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-001-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-001-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-001-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-001.jpg",
      "preview": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-001.webp"
    }
  },
  {
    "slug": "face-gems-002",
    "title": "Pastel Iridescent Gem Crown",
    "alt": "Pastel Iridescent Gem Crown by Happy Faces LA.",
    "service": "face-gems",
    "serviceLabel": "Face Gems",
    "category": "Face Gems",
    "speed": "face-gems",
    "speedLabel": "Face Gems",
    "designStyle": "not-sure",
    "prefill": {
      "service": "face-gems",
      "design_style": "not-sure",
      "public_look_slug": "face-gems-002",
      "public_look_title": "Pastel Iridescent Gem Crown",
      "category": "Face Gems",
      "inspiration_image_id": "face-gems-002"
    },
    "image": {
      "width": 2634,
      "height": 2634,
      "avif": [
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-002-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-002-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-002-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-002-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-002-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-002-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-002-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-002-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-002-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-002-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-002-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-002-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-002.jpg",
      "preview": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-002.webp"
    }
  },
  {
    "slug": "face-gems-003",
    "title": "Rainbow Gem Crown Forehead and Cheeks",
    "alt": "Rainbow Gem Crown Forehead and Cheeks by Happy Faces LA.",
    "service": "face-gems",
    "serviceLabel": "Face Gems",
    "category": "Face Gems",
    "speed": "face-gems",
    "speedLabel": "Face Gems",
    "designStyle": "not-sure",
    "prefill": {
      "service": "face-gems",
      "design_style": "not-sure",
      "public_look_slug": "face-gems-003",
      "public_look_title": "Rainbow Gem Crown Forehead and Cheeks",
      "category": "Face Gems",
      "inspiration_image_id": "face-gems-003"
    },
    "image": {
      "width": 2481,
      "height": 2481,
      "avif": [
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-003-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-003-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-003-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-003-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-003-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-003-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-003-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-003-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-003-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-003-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-003-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-003-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-003.jpg",
      "preview": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-003.webp"
    }
  },
  {
    "slug": "face-gems-004",
    "title": "Star Gem Eye Crown with Crystal Teardrops",
    "alt": "Star Gem Eye Crown with Crystal Teardrops by Happy Faces LA.",
    "service": "face-gems",
    "serviceLabel": "Face Gems",
    "category": "Face Gems",
    "speed": "face-gems",
    "speedLabel": "Face Gems",
    "designStyle": "not-sure",
    "prefill": {
      "service": "face-gems",
      "design_style": "not-sure",
      "public_look_slug": "face-gems-004",
      "public_look_title": "Star Gem Eye Crown with Crystal Teardrops",
      "category": "Face Gems",
      "inspiration_image_id": "face-gems-004"
    },
    "image": {
      "width": 2541,
      "height": 2541,
      "avif": [
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-004-480.avif",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-004-768.avif",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-004-1024.avif",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-004-1440.avif",
          "width": 1440
        }
      ],
      "webp": [
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-004-480.webp",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-004-768.webp",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-004-1024.webp",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-004-1440.webp",
          "width": 1440
        }
      ],
      "jpg": [
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-004-480.jpg",
          "width": 480
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-004-768.jpg",
          "width": 768
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-004-1024.jpg",
          "width": 1024
        },
        {
          "src": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-004-1440.jpg",
          "width": 1440
        }
      ],
      "fallback": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-004.jpg",
      "preview": "/images/party-lookbook/face-gems/happy-faces-la-face-gems-004.webp"
    }
  }
];

export const lookbookServiceFilters: LookbookFilter[] = [
  {
    "value": "face-painting",
    "label": "Face Painting"
  },
  {
    "value": "balloon-twisting",
    "label": "Balloon Twisting"
  },
  {
    "value": "face-gems",
    "label": "Face Gems"
  }
];

export const lookbookSpeedFilters: LookbookFilter[] = [
  {
    "value": "quick-designs",
    "label": "Quick Designs"
  },
  {
    "value": "classic-party",
    "label": "Classic Party Designs"
  },
  {
    "value": "premium-full-face",
    "label": "Premium / Full-Face Designs"
  },
  {
    "value": "balloon-favorites",
    "label": "Balloon Favorites"
  },
  {
    "value": "face-gems",
    "label": "Face Gems"
  }
];

export const lookbookCategoryFilters: LookbookFilter[] = [
  {
    "value": "Animals",
    "label": "Animals"
  },
  {
    "value": "Balloon Animals",
    "label": "Balloon Animals"
  },
  {
    "value": "Balloon Favorites",
    "label": "Balloon Favorites"
  },
  {
    "value": "Balloon Flowers",
    "label": "Balloon Flowers"
  },
  {
    "value": "Balloon Hats",
    "label": "Balloon Hats"
  },
  {
    "value": "Balloon Swords",
    "label": "Balloon Swords"
  },
  {
    "value": "Character-Inspired",
    "label": "Character-Inspired"
  },
  {
    "value": "Cheek Art",
    "label": "Cheek Art"
  },
  {
    "value": "Classic Designs",
    "label": "Classic Designs"
  },
  {
    "value": "Face Gems",
    "label": "Face Gems"
  },
  {
    "value": "Fantasy",
    "label": "Fantasy"
  },
  {
    "value": "Seasonal",
    "label": "Seasonal"
  }
];

export const lookbookHero: LookbookItem = {
  "slug": "face-painting-036",
  "title": "Rainbow Butterfly Full-Face Design with Black Wing Detail",
  "alt": "Rainbow Butterfly Full-Face Design with Black Wing Detail by Happy Faces LA.",
  "service": "face-painting",
  "serviceLabel": "Face Painting",
  "category": "Fantasy",
  "speed": "premium-full-face",
  "speedLabel": "Premium / Full-Face Designs",
  "designStyle": "full-face",
  "prefill": {
    "service": "face-painting",
    "design_style": "full-face",
    "public_look_slug": "face-painting-036",
    "public_look_title": "Rainbow Butterfly Full-Face Design with Black Wing Detail",
    "category": "Fantasy",
    "inspiration_image_id": "face-painting-036"
  },
  "image": {
    "width": 3024,
    "height": 4032,
    "avif": [
      {
        "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-480.avif",
        "width": 480
      },
      {
        "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-768.avif",
        "width": 768
      },
      {
        "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-1024.avif",
        "width": 1024
      },
      {
        "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-1440.avif",
        "width": 1440
      }
    ],
    "webp": [
      {
        "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-480.webp",
        "width": 480
      },
      {
        "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-768.webp",
        "width": 768
      },
      {
        "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-1024.webp",
        "width": 1024
      },
      {
        "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-1440.webp",
        "width": 1440
      }
    ],
    "jpg": [
      {
        "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-480.jpg",
        "width": 480
      },
      {
        "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-768.jpg",
        "width": 768
      },
      {
        "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-1024.jpg",
        "width": 1024
      },
      {
        "src": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036-1440.jpg",
        "width": 1440
      }
    ],
    "fallback": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036.jpg",
    "preview": "/images/party-lookbook/face-painting/happy-faces-la-face-painting-036.webp"
  }
};
