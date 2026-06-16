export type LocationItem = {
    slug: string;
    city: string;
    county: string;
    metaTitle: string;
    metaDescription: string;
    heroTitle: string;
    heroDescription: string;
    serviceIntro: string;
    eventSettings: string[];
    planningNotes: string[];
    setupNotes: string[];
    nearby: string[];
};

export const priorityLocations: LocationItem[] = [
    {
        slug: "los-angeles",
        city: "Los Angeles",
        county: "Los Angeles County",
        metaTitle: "Face Painting in Los Angeles | Happy Faces LA",
        metaDescription: "Face painting, balloon twisting, glitter tattoos, and face gems for Los Angeles birthdays, school events, and family celebrations.",
        heroTitle: "Face Painting, Balloon Twisting & Glitter Tattoos in Los Angeles",
        heroDescription: "Happy Faces LA supports Los Angeles birthdays, school events, festivals, and private celebrations with event-friendly face painting, balloons, glitter tattoos, and face jewelry.",
        serviceIntro: "Los Angeles events can range from backyard birthdays to school fundraisers and community celebrations, so the plan should account for guest flow, setup access, parking, and the mix of ages at the party.",
        eventSettings: [
            "Backyard birthdays and apartment community rooms",
            "School, PTA, and camp celebrations",
            "Festival booths and community gatherings",
            "Corporate family days and private celebrations"
        ],
        planningNotes: [
            "Share the neighborhood or nearest cross streets because Los Angeles drive times vary by time of day.",
            "Tell us whether the artist setup is indoors, outdoors, curbside, upstairs, or in a shared community space.",
            "For larger events, note whether you prefer one combined line or separate activity stations."
        ],
        setupNotes: [
            "A shaded, level setup area helps face painting and glitter services run smoothly.",
            "Balloon twisting works best where guests can line up without blocking food, entrances, or games.",
            "For school or venue events, include vendor check-in instructions and parking notes."
        ],
        nearby: ["burbank", "glendale", "pasadena"]
    },
    {
        slug: "burbank",
        city: "Burbank",
        county: "Los Angeles County",
        metaTitle: "Face Painting in Burbank | Happy Faces LA",
        metaDescription: "Face painting, balloon twisting, glitter tattoos, and face gems for Burbank birthdays, school events, and family celebrations.",
        heroTitle: "Face Painting, Balloon Twisting & Glitter Tattoos in Burbank",
        heroDescription: "Happy Faces LA supports Burbank birthdays, school events, studio-adjacent family days, and private celebrations with clean, kid-friendly event entertainment.",
        serviceIntro: "Burbank parties often need compact setups that work for homes, schools, patios, and community rooms. The best plan matches the service mix to guest count, available space, and event timing.",
        eventSettings: [
            "Kids birthday parties at homes or community rooms",
            "School fairs, PTA events, and fundraiser stations",
            "Studio-adjacent family events",
            "Park and picnic-style family celebrations"
        ],
        planningNotes: [
            "Share the venue type so setup can be sized for a backyard, classroom, patio, or event room.",
            "Mention parking or loading notes if the artist needs to carry supplies from a garage, lot, or street space.",
            "For younger guest lists, note whether you want faster cheek art, balloons, or a mixed-service setup."
        ],
        setupNotes: [
            "Face painting and gems need a small table area with good light.",
            "Balloon twisting should sit near the main activity flow but away from food service.",
            "For school events, include arrival instructions and the contact person on site."
        ],
        nearby: ["glendale", "studio-city", "los-angeles"]
    },
    {
        slug: "glendale",
        city: "Glendale",
        county: "Los Angeles County",
        metaTitle: "Face Painting in Glendale | Happy Faces LA",
        metaDescription: "Face painting, balloon twisting, glitter tattoos, and face gems for Glendale birthdays, school events, and family celebrations.",
        heroTitle: "Face Painting, Balloon Twisting & Glitter Tattoos in Glendale",
        heroDescription: "Happy Faces LA supports Glendale birthdays, school events, community gatherings, and private family celebrations with face painting, balloons, glitter tattoos, and face jewelry.",
        serviceIntro: "Glendale events can span home parties, school campuses, community rooms, and larger family gatherings. Planning around access, shade, and guest age range keeps the entertainment line moving.",
        eventSettings: [
            "Home birthdays and family parties",
            "School carnivals and classroom celebrations",
            "Community room and clubhouse events",
            "Festival-style booths and family days"
        ],
        planningNotes: [
            "Share whether the setup is at a home, school, park, or shared event room.",
            "Note guest count and age range so the artist can recommend faster designs or a multi-service flow.",
            "Include parking, gate, elevator, or loading instructions when available."
        ],
        setupNotes: [
            "Outdoor face painting should have shade and a stable chair/table setup.",
            "Glitter tattoos and face gems work well as a compact add-on station.",
            "For bigger events, separate balloon and face-painting lines can reduce crowding."
        ],
        nearby: ["burbank", "pasadena", "los-angeles"]
    },
    {
        slug: "pasadena",
        city: "Pasadena",
        county: "Los Angeles County",
        metaTitle: "Face Painting in Pasadena | Happy Faces LA",
        metaDescription: "Face painting, balloon twisting, glitter tattoos, and face gems for Pasadena birthdays, school events, and family celebrations.",
        heroTitle: "Face Painting, Balloon Twisting & Glitter Tattoos in Pasadena",
        heroDescription: "Happy Faces LA supports Pasadena birthdays, school celebrations, family events, and community gatherings with colorful, event-ready entertainment.",
        serviceIntro: "Pasadena events often combine outdoor family spaces, school functions, and community celebrations. The best setup balances guest count, shade, and line placement before the event begins.",
        eventSettings: [
            "Birthday parties at homes and shared spaces",
            "School events, carnivals, and fundraisers",
            "Community celebrations and family festivals",
            "Private celebrations with mixed-age guests"
        ],
        planningNotes: [
            "Share whether the event is indoors, outdoors, or split between multiple areas.",
            "Mention expected guest arrival patterns so the activity station can handle rushes.",
            "Include access notes for parking, gates, elevators, or venue check-in."
        ],
        setupNotes: [
            "A shaded face-painting station helps designs stay comfortable for kids.",
            "Balloon twisting works well near entrances or party activity zones when the line has space.",
            "For multi-service events, decide whether guests should move through one station or choose separate lines."
        ],
        nearby: ["glendale", "los-angeles", "sherman-oaks"]
    },
    {
        slug: "sherman-oaks",
        city: "Sherman Oaks",
        county: "Los Angeles County",
        metaTitle: "Face Painting in Sherman Oaks | Happy Faces LA",
        metaDescription: "Face painting, balloon twisting, glitter tattoos, and face gems for Sherman Oaks birthdays, school events, and family celebrations.",
        heroTitle: "Face Painting, Balloon Twisting & Glitter Tattoos in Sherman Oaks",
        heroDescription: "Happy Faces LA supports Sherman Oaks birthdays, school events, park-adjacent parties, and private family celebrations with polished kids entertainment.",
        serviceIntro: "Sherman Oaks parties often need flexible entertainment that works for backyards, shared community rooms, and school events. Guest count and setup access help determine the right service mix.",
        eventSettings: [
            "Backyard birthday parties",
            "School and preschool celebrations",
            "Community room and HOA events",
            "Family gatherings with mixed age ranges"
        ],
        planningNotes: [
            "Share parking and arrival notes if the setup is on a hillside street, shared lot, or gated property.",
            "Mention whether the party schedule has cake, games, or a show that affects activity timing.",
            "For larger groups, provide an estimated child count so the line plan fits the event length."
        ],
        setupNotes: [
            "Face painting works best away from bounce houses, sprinklers, and food tables.",
            "Balloon twisting can be placed near the main party area when there is room for a queue.",
            "Glitter tattoos and face gems are compact options for older kids and photo moments."
        ],
        nearby: ["studio-city", "encino", "los-angeles"]
    },
    {
        slug: "studio-city",
        city: "Studio City",
        county: "Los Angeles County",
        metaTitle: "Face Painting in Studio City | Happy Faces LA",
        metaDescription: "Face painting, balloon twisting, glitter tattoos, and face gems for Studio City birthdays, school events, and family celebrations.",
        heroTitle: "Face Painting, Balloon Twisting & Glitter Tattoos in Studio City",
        heroDescription: "Happy Faces LA supports Studio City birthdays, school events, patio parties, and private celebrations with face painting, balloons, glitter tattoos, and face jewelry.",
        serviceIntro: "Studio City events often happen in homes, patios, school spaces, and private venues where setup footprint matters. A clear event flow helps the artist serve kids efficiently.",
        eventSettings: [
            "Home and backyard birthday parties",
            "School celebrations and family events",
            "Patio, clubhouse, and restaurant-adjacent parties",
            "Studio and production family events"
        ],
        planningNotes: [
            "Share whether the setup area is indoors, outdoors, covered, or near food service.",
            "Mention valet, garage, or street parking details if access is limited.",
            "Tell us whether the event has a tight schedule so the service mix can be paced accordingly."
        ],
        setupNotes: [
            "A compact table setup works well for face gems, glitter tattoos, and cheek art.",
            "Balloon twisting should have a line path that does not block servers or walkways.",
            "For older kids, face gems can pair well with glitter tattoos and smaller face-painting designs."
        ],
        nearby: ["sherman-oaks", "encino", "burbank"]
    },
    {
        slug: "encino",
        city: "Encino",
        county: "Los Angeles County",
        metaTitle: "Face Painting in Encino | Happy Faces LA",
        metaDescription: "Face painting, balloon twisting, glitter tattoos, and face gems for Encino birthdays, school events, and family celebrations.",
        heroTitle: "Face Painting, Balloon Twisting & Glitter Tattoos in Encino",
        heroDescription: "Happy Faces LA supports Encino birthdays, school celebrations, park-adjacent events, and private family parties with kid-friendly face painting, balloons, glitter tattoos, and face jewelry.",
        serviceIntro: "Encino parties often use backyards, school spaces, and park-adjacent setups. The best entertainment plan accounts for sun, guest arrival timing, and how kids will move through the activity station.",
        eventSettings: [
            "Backyard birthdays and family parties",
            "School and camp celebrations",
            "Park-adjacent gatherings",
            "Private events with toddlers, kids, and older siblings"
        ],
        planningNotes: [
            "Share whether the event is at a home, school, park-adjacent space, or private venue.",
            "Mention shade, power needs, and where the activity line should form.",
            "For mixed ages, note whether you want quick designs for younger kids and gems or glitter for older guests."
        ],
        setupNotes: [
            "Outdoor setups should have shade and enough space for a small line.",
            "Balloon twisting is easiest when guests can wait without blocking party seating.",
            "For multi-service bookings, a simple line plan keeps kids moving through each activity."
        ],
        nearby: ["sherman-oaks", "studio-city", "los-angeles"]
    }
];
