import { business } from "../data/business";

type Faq = {
    question: string;
    answer: string;
};

export function organizationJsonLd() {
    return {
        "@context": "https://schema.org",
        "@type": "Organization",
        "@id": `${business.url}/#organization`,
        name: business.name,
        url: business.url,
        logo: `${business.url}/images/happy-faces-la-logo.png`,
        telephone: business.phone,
        sameAs: [business.instagramUrl]
    };
}

export function localBusinessJsonLd() {
    return {
        "@context": "https://schema.org",
        "@type": "LocalBusiness",
        "@id": `${business.url}/#localbusiness`,
        name: business.name,
        url: business.url,
        image: `${business.url}/images/services/happy-faces-la-face-painting-service.webp`,
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
        "@id": `${business.url}/#website`,
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

export function articleJsonLd(params: {
    headline: string;
    description: string;
    datePublished: string;
    dateModified?: string;
    image: string;
    url: string;
}) {
    return {
        "@context": "https://schema.org",
        "@type": "Article",
        headline: params.headline,
        description: params.description,
        datePublished: params.datePublished,
        dateModified: params.dateModified ?? params.datePublished,
        author: {
            "@type": "Organization",
            name: business.name,
            url: business.url
        },
        publisher: {
            "@type": "Organization",
            name: business.name,
            url: business.url
        },
        image: params.image,
        mainEntityOfPage: {
            "@type": "WebPage",
            "@id": params.url
        }
    };
}
