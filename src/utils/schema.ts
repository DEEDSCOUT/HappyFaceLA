import { business } from "../data/business";

type Faq = {
    question: string;
    answer: string;
};

export function organizationJsonLd() {
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        name: business.name,
        url: business.url,
        telephone: business.phone,
        sameAs: [business.instagramUrl]
    };
}

export function localBusinessJsonLd() {
    return {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        name: business.name,
        url: business.url,
        telephone: business.phone,
        areaServed: business.areaServed,
        sameAs: [business.instagramUrl],
        makesOffer: business.services.map((service) => ({
            "@type": "Offer",
            itemOffered: {
                "@type": "Service",
                name: service
            }
        }))
    };
}

export function websiteJsonLd() {
    return {
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: business.name,
        url: business.url
    };
}

export function breadcrumbJsonLd(items: Array<{ name: string; url: string }>) {
    return {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: item.name,
            item: item.url
        }))
    };
}

export function serviceJsonLd(serviceName: string, pageUrl: string) {
    return {
        "@context": "https://schema.org",
        "@type": "Service",
        name: serviceName,
        provider: {
            "@type": "LocalBusiness",
            name: business.name,
            telephone: business.phone,
            areaServed: business.areaServed
        },
        areaServed: business.areaServed,
        serviceType: serviceName,
        url: pageUrl
    };
}

export function faqJsonLd(faqs: Faq[]) {
    return {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: faqs.map((faq) => ({
            "@type": "Question",
            name: faq.question,
            acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer
            }
        }))
    };
}
