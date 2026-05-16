export type PackageItem = {
    name: string;
    bestFor: string;
    features: string[];
    duration: string;
    guestCapacity: string;
    startingPrice: string;
};

export const packages: PackageItem[] = [
    {
        name: "Mini Party Package",
        bestFor: "Small birthdays",
        features: ["1 artist", "Face painting OR balloon twisting"],
        duration: "TBD_BY_OWNER",
        guestCapacity: "TBD_BY_OWNER",
        startingPrice: "TBD_BY_OWNER"
    },
    {
        name: "Signature Party Package",
        bestFor: "Birthdays and family parties",
        features: [
            "Face painting + balloon twisting",
            "or face painting + glitter tattoos"
        ],
        duration: "TBD_BY_OWNER",
        guestCapacity: "TBD_BY_OWNER",
        startingPrice: "TBD_BY_OWNER"
    },
    {
        name: "Premium Wow Package",
        bestFor: "Larger private events",
        features: [
            "Face painting + balloon twisting + glitter tattoos + face gems",
            "1-2 artists depending on guest count"
        ],
        duration: "TBD_BY_OWNER",
        guestCapacity: "TBD_BY_OWNER",
        startingPrice: "TBD_BY_OWNER"
    },
    {
        name: "School/Festival Package",
        bestFor: "Carnivals, fundraisers, festivals, camps",
        features: ["Higher guest throughput", "Multiple artists optional"],
        duration: "TBD_BY_OWNER",
        guestCapacity: "TBD_BY_OWNER",
        startingPrice: "Quote required"
    },
    {
        name: "Corporate Family Event Package",
        bestFor: "Company picnics, malls, city events",
        features: ["Custom setup and invoice", "Optional COI if available"],
        duration: "TBD_BY_OWNER",
        guestCapacity: "TBD_BY_OWNER",
        startingPrice: "Quote required"
    }
];
