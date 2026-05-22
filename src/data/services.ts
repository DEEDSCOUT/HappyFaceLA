export type ServiceItem = {
    slug: string;
    name: string;
    shortName: string;
    title: string;
    description: string;
    intro: string;
    /** Parent-focused hero subcopy shown directly under the H1 on the service page. */
    heroSubcopy?: string;
    /** Optional override for the cross-sell section heading on this service page. */
    crossSellTitle?: string;
    /** Optional override for the cross-sell section sub-copy on this service page. */
    crossSellDescription?: string;
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
        heroSubcopy:
            "Face painting designs for parties and events, with kid-friendly designs and quick line management for birthdays, school events, festivals, and family celebrations across Los Angeles, Orange County, and Ventura County. Often booked together with balloon twisting, glitter tattoos, or face gems for a full party experience.",
        crossSellTitle: "More Than Face Painting — Complete Kids Party Fun",
        crossSellDescription:
            "Many families book face painting together with balloon twisting, glitter tattoos, or face gems so guests have more to do while lines move faster. Choose one service or build a package around your event size, age range, and schedule.",
        whatItIncludes: [
            "Custom designs for each child",
            "Kid-friendly theme options",
            "Fast line management for busy parties",
            "Face painting designs for parties and events",
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
        heroSubcopy:
            "Balloon animals, swords, princess crowns, and themed designs kids can take home. Fast turnaround keeps event lines moving at birthdays, school events, festivals, and corporate family days across Los Angeles. Pairs naturally with face painting, glitter tattoos, and face gems.",
        crossSellTitle: "More Than Balloon Twisting — Build a Full Party Lineup",
        crossSellDescription:
            "Balloon twisting is a great anchor service. Add face painting, glitter tattoos, or face gems so guests have multiple stations and short waits across the event.",
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
        heroSubcopy:
            "Temporary glitter tattoo designs for parties and events, lasting 1–3 days — a fast, photo-friendly station for older kids and teens. Great for school carnivals, festival booths, and high-traffic birthday lines across Los Angeles. Often paired with face painting or face gems for full theme looks.",
        crossSellTitle: "Pair Glitter Tattoos With Other Party Services",
        crossSellDescription:
            "Glitter tattoos move fast — perfect alongside slower stations like face painting or as a finishing touch with face gems. Add balloon twisting to give younger guests a take-home keepsake.",
        whatItIncludes: [
            "Glitter tattoo designs in a range of styles",
            "Lasts 1–3 days on skin",
            "Fast application, great for large groups",
        ],
        bestFor: [
            "School carnivals and festival booths",
            "Birthday party add-ons",
            "Events with older kids and teens",
            "High-throughput party lines",
        ],
        addOns: ["Face painting", "Face gems", "Balloon twisting"],
        image: "/images/services/happy-faces-la-glitter-tattoo-service.webp",
        imageAlt: "Glitter tattoo application by Happy Faces LA at a kids birthday party in Los Angeles",
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
        heroSubcopy:
            "Crystal-like face gems and face jewelry add sparkle to themed birthday parties, princess and fairy events, and high-impact photo moments. Booked alone or as a finishing touch on top of face painting and glitter tattoos for older kids and teens.",
        crossSellTitle: "Build a Full Look — Pair Face Gems With Other Services",
        crossSellDescription:
            "Face gems pair beautifully with face painting and glitter tattoos for layered, photo-ready looks. Add balloon twisting to keep younger guests engaged at the same event.",
        whatItIncludes: [
            "Face gems and face jewelry pieces",
            "Crystal-like accent designs",
            "Easy removal after the event",
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
