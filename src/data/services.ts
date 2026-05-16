export type ServiceItem = {
    slug: string;
    name: string;
    shortName: string;
    title: string;
    description: string;
    intro: string;
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
            "Happy Faces LA provides colorful, event-ready face painting with kid-friendly designs and fast line management for busy events."
    },
    {
        slug: "balloon-twisting-los-angeles",
        name: "Balloon Twisting",
        shortName: "Balloon twisting",
        title: "Balloon Twisting in Los Angeles",
        description:
            "Book balloon twisting for kids parties, school events, and family-friendly corporate events in Los Angeles.",
        intro:
            "Our balloon twisting service adds movement and excitement to events with crowd-friendly designs and quick interactions."
    },
    {
        slug: "glitter-tattoos-los-angeles",
        name: "Glitter Tattoos",
        shortName: "Glitter tattoos",
        title: "Glitter Tattoos in Los Angeles",
        description:
            "Glitter tattoos for birthdays, school carnivals, and festivals with clean setup and event-ready service.",
        intro:
            "Glitter tattoos are a fast, photo-friendly add-on for events where guests want fun designs and short wait times."
    },
    {
        slug: "face-gems-face-jewelry-los-angeles",
        name: "Face Gems & Face Jewelry",
        shortName: "Face gems",
        title: "Face Gems & Face Jewelry in Los Angeles",
        description:
            "Face gems and face jewelry add-on service for kids parties, themed celebrations, and high-impact photo moments.",
        intro:
            "Face gems and face jewelry can be booked as a standalone station or combined with painting, balloons, and glitter tattoos."
    }
];
