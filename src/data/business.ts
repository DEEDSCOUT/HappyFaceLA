export const business = {
    name: "Happy Faces LA",
    legalName: "TBD_BY_OWNER",
    url: "https://happyfacesla.com",
    canonicalDomain: "happyfacesla.com",
    redirectDomain: "happyfacela.com",
    phone: "+18186195506",
    displayPhone: "818-619-5506",
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
