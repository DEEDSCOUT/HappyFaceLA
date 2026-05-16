export type LocationItem = {
    slug: string;
    city: string;
    nearby: string[];
};

export const priorityLocations: LocationItem[] = [
    { slug: "los-angeles", city: "Los Angeles", nearby: ["burbank", "glendale", "pasadena"] },
    { slug: "burbank", city: "Burbank", nearby: ["glendale", "studio-city", "los-angeles"] },
    { slug: "glendale", city: "Glendale", nearby: ["burbank", "pasadena", "los-angeles"] },
    { slug: "pasadena", city: "Pasadena", nearby: ["glendale", "los-angeles", "sherman-oaks"] },
    { slug: "sherman-oaks", city: "Sherman Oaks", nearby: ["studio-city", "encino", "los-angeles"] },
    { slug: "studio-city", city: "Studio City", nearby: ["sherman-oaks", "encino", "burbank"] },
    { slug: "encino", city: "Encino", nearby: ["sherman-oaks", "studio-city", "los-angeles"] }
];
