export type ServiceItem = {
    slug: string;
    name: string;
    shortName: string;
    title: string;
    description: string;
    intro: string;
    whatItIncludes: string[];
    bestFor: string[];
    addOns: string[];
    /** Optional service card/page image */
    image?: string;
    imageAlt?: string;
};

export const services: ServiceItem[] = [
    {
        slug: "face-painting-los-angeles",
        name: "Face Painting",
        shortName: "Face painting",
        title: "Face Painting in Los Angeles",
        description:
            "Professional face painting for birthdays, school events, festivals, and private celebrations across Los Angeles.",
        intro:
            "Happy Faces LA provides colorful, event-ready face painting with kid-friendly designs and fast line management for busy events.",
        whatItIncludes: [
            "Custom designs for each child",
            "Kid-friendly theme options",
            "Fast line management for busy parties",
            "Cosmetic-grade face paints and clean supplies",
        ],
        bestFor: [
            "Kids birthday parties",
            "School carnivals and festivals",
            "Corporate family events",
            "Private celebrations",
        ],
        addOns: ["Balloon twisting", "Glitter tattoos", "Face gems / face jewelry"],
        image: "/images/services/happy-faces-la-face-painting-service.webp",
        imageAlt: "Happy Faces LA face painting at a birthday party in Los Angeles",
    },
    {
        slug: "balloon-twisting-los-angeles",
        name: "Balloon Twisting",
        shortName: "Balloon twisting",
        title: "Balloon Twisting in Los Angeles",
        description:
            "Book balloon twisting for kids parties, school events, and family-friendly corporate events in Los Angeles.",
        intro:
            "Our balloon twisting service adds movement and excitement to events with crowd-friendly designs and quick interactions.",
        whatItIncludes: [
            "Custom balloon animals and themed designs",
            "Interactive experience for kids",
            "Fast turnaround for event lines",
            "Kid-safe latex balloons",
        ],
        bestFor: [
            "Birthday parties",
            "School events",
            "Family-friendly festivals",
            "Corporate family days",
        ],
        addOns: ["Face painting", "Glitter tattoos", "Face gems"],
        image: "/images/services/happy-faces-la-balloon-twisting-service.webp",
        imageAlt: "Happy Faces LA artist at a birthday party with balloon flowers",
    },
    {
        slug: "glitter-tattoos-los-angeles",
        name: "Glitter Tattoos",
        shortName: "Glitter tattoos",
        title: "Glitter Tattoos in Los Angeles",
        description:
            "Glitter tattoos for birthdays, school carnivals, and festivals with clean setup and event-ready service.",
        intro:
            "Glitter tattoos are a fast, photo-friendly add-on for events where guests want fun designs and short wait times.",
        whatItIncludes: [
            "Cosmetic-grade glitter in a range of designs",
            "Lasts 1–3 days on skin",
            "Safe for most skin types",
            "Fast application, great for large groups",
        ],
        bestFor: [
            "School carnivals and festival booths",
            "Birthday party add-ons",
            "Events with older kids and teens",
            "High-throughput party lines",
        ],
        addOns: ["Face painting", "Face gems", "Balloon twisting"],
    },
    {
        slug: "face-gems-face-jewelry-los-angeles",
        name: "Face Gems & Face Jewelry",
        shortName: "Face gems",
        title: "Face Gems & Face Jewelry in Los Angeles",
        description:
            "Face gems and face jewelry add-on service for kids parties, themed celebrations, and high-impact photo moments.",
        intro:
            "Face gems and face jewelry can be booked as a standalone station or combined with painting, balloons, and glitter tattoos.",
        whatItIncludes: [
            "Body-safe gems and face jewelry pieces",
            "Crystal-like accent designs",
            "Safe adhesive with easy removal",
            "Photo-ready results for any theme",
        ],
        bestFor: [
            "Themed birthday parties",
            "Princess, fairy, and fantasy events",
            "High-impact photo moments",
            "Older kids and teens",
        ],
        addOns: ["Glitter tattoos", "Face painting", "Balloon twisting"],
        image: "/images/services/happy-faces-la-face-gems-service.webp",
        imageAlt: "Face gems and crystal jewelry applied by Happy Faces LA at a birthday party",
    }
];
