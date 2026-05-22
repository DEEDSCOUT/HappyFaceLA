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
        name: "Birthday Party Package",
        bestFor: "Kids birthday parties",
        features: [
            "Face painting or balloon twisting",
            "1 artist, dedicated to your event",
            "Kid-friendly designs, fast line management",
        ],
        duration: "Varies by guest count",
        guestCapacity: "Varies by event",
        startingPrice: "Bookings start at $150",
    },
    {
        name: "Face Painting + Balloons Package",
        bestFor: "Birthdays, family parties, and school events",
        features: [
            "Face painting + balloon twisting combined",
            "Two-activity setup for longer guest engagement",
            "Great for parties of all sizes",
        ],
        duration: "Varies by guest count",
        guestCapacity: "Varies by event",
        startingPrice: "Request a quote",
    },
    {
        name: "Glitter + Gems Add-On",
        bestFor: "Themed events, older kids, and photo moments",
        features: [
            "Glitter tattoo designs",
            "Face gems and face jewelry",
            "Can be combined with any other service",
        ],
        duration: "Varies by guest count",
        guestCapacity: "Varies by event",
        startingPrice: "Request a quote",
    },
    {
        name: "School / Festival Booth",
        bestFor: "School carnivals, fundraisers, festivals, and camps",
        features: [
            "High guest throughput setup",
            "Multiple artists available",
            "Mix of services available at one booth",
        ],
        duration: "Varies by event",
        guestCapacity: "Varies by event",
        startingPrice: "Quote required",
    },
    {
        name: "Corporate Family Event Booth",
        bestFor: "Company picnics, city events, and malls",
        features: [
            "Custom setup and professional invoice",
            "Full-service entertainment station",
        ],
        duration: "Varies by event",
        guestCapacity: "Varies by event",
        startingPrice: "Quote required",
    },
];

