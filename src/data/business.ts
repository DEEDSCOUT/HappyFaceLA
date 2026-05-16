export const business = {
    name: "Happy Faces LA",
    legalName: "TBD_BY_OWNER",
    url: "https://happyfacesla.com",
    canonicalDomain: "happyfacesla.com",
    redirectDomain: "happyfacela.com",
    phone: "+18186195506",
    displayPhone: "818-619-5506",
    instagramHandle: "happyfacesla",
    instagramUrl: "https://www.instagram.com/happyfacesla",
    businessAddress: "TBD_BY_OWNER",
    serviceAreaOnly: "TBD_BY_OWNER",
    insuranceCoiStatus: "TBD_BY_OWNER",
    serviceRadius: "TBD_BY_OWNER",
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
