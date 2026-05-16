export type FaqItem = {
    question: string;
    answer: string;
};

export const commonFaqs: FaqItem[] = [
    {
        question: "Do you offer face painting and balloon twisting together?",
        answer:
            "Yes. Happy Faces LA offers face painting, balloon twisting, glitter tattoos, and face gems for Los Angeles parties and events. Combo packages are available based on event size, location, and date."
    },
    {
        question: "What areas does Happy Faces LA serve?",
        answer:
            "Happy Faces LA serves Los Angeles and nearby LA-area cities including Burbank, Glendale, Pasadena, Sherman Oaks, Studio City, Encino, Santa Monica, Beverly Hills, West Hollywood, and surrounding areas."
    },
    {
        question: "How is pricing calculated?",
        answer:
            "Pricing depends on event date, location, number of guests, services requested, and artist count. Submit your event details for an accurate quote."
    },
    {
        question: "Can schools and companies request custom quotes?",
        answer:
            "Yes. Schools, festivals, and corporate family events can request custom quotes based on attendance, service mix, setup needs, and timeline."
    }
];
