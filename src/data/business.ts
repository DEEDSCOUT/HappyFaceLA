export const business = {
    name: "Happy Faces LA",
    legalName: "TBD_BY_OWNER",
    url: "https://happyfacesla.com",
    canonicalDomain: "happyfacesla.com",
    redirectDomain: "happyfacela.com",
    phone: "+13108002860",
    displayPhone: "(310) 800-2860",
    email: "info@happyfacesla.com",
    instagramHandle: "happy_faces_la",
    instagramUrl: "https://www.instagram.com/happy_faces_la/",
    businessAddress: "",
    serviceAreaOnly: "Yes — service-area-only. No public address.",
    insuranceCoiStatus: "",
    serviceRadius: "Los Angeles and nearby areas",
    services: [
        "Face Painting",
        "Balloon Twisting",
        "Glitter Tattoos",
        "Face Gems",
        "Face Jewelry"
    ],
    areaServed: [
        "Los Angeles",
        "Burbank",
        "Glendale",
        "Pasadena",
        "Sherman Oaks",
        "Studio City",
        "Encino",
        "Woodland Hills",
        "Northridge",
        "Santa Monica",
        "Beverly Hills",
        "West Hollywood",
        "Calabasas"
    ]
} as const;

export type Business = typeof business;
