/**
 * Category tree for product search (docs/PRODUCT-SEARCH.md section 11). Rules only: the store's own category label and the title are matched against
 * keyword rules, most specific first. Nothing is sent to an AI here; products no rule places stay "Other" and are counted, and only those few
 * (the AI budget is 1% of listings a day) are ever looked at by the capped AI step.
 */
/** Bump when RULES change: the sync classifies every listing again */
export const TAXONOMY_VERSION = 2

const RULES: [string, RegExp][] = [
  // electronics
  ['Eyewear > Contact lenses', /\b(contact lens(es)?|lens solution|colou?red lens)\b/i],
  ['Eyewear > Sunglasses', /\b(sun ?glasses?|shades|polari[sz]ed|aviator|wayfarer|ray-?ban|oakley)\b/i],
  ['Eyewear > Frames & glasses', /\b(eye ?glasses|spectacles?|optical frames?|eyewear|reading glasses|blue ?light|prescription|glasses|chasma|frames?)\b/i],
  ['Electronics > Mobile phones > Accessories', /\b(phone|mobile|iphone|samsung|galaxy)?\s?(cases?|covers?|screen protectors?|tempered|glass protector|back skin|pop ?socket|selfie stick|mobile holder|phone holder)\b|\b(power ?bank|charger|charging|cable|adapter|usb[- ]?c|lightning|type[- ]?c)\b/i],
  ['Electronics > Mobile phones', /\b(iphone|galaxy [asmz]\d+|galaxy (note|fold|flip)|redmi|poco|infinix|tecno|vivo|oppo|realme|honor|itel|nokia|pixel \d|oneplus|sparx|zte|moto [eg]\d|smart ?phones?|mobile phones?|keypad phone|feature phone)\b/i],
  ['Electronics > Tablets', /\b(ipad|tablets?|galaxy tab|redmi pad)\b/i],
  ['Electronics > Laptops', /\b(laptops?|notebooks?|macbook|chromebook|thinkpad|ideapad|vivobook|zenbook|inspiron|latitude|elitebook|probook)\b/i],
  ['Electronics > Smart watches', /\b(smart ?watch(es)?|fitness (band|tracker)|apple watch|galaxy watch|amazfit|smart band)\b/i],
  ['Electronics > Audio > Earbuds & headphones', /\b(earbuds?|airpods|ear ?phones?|head ?phones?|neckband|tws|handsfree|hands-free|buds)\b/i],
  ['Electronics > Audio > Speakers', /\b(speakers?|soundbar|sound bar|woofer|boombox|bluetooth speaker)\b/i],
  ['Electronics > TVs', /\b(led tv|smart tv|android tv|oled|qled|television|tv \d{2}|\d{2}["”]? ?(tv|led))\b/i],
  ['Electronics > Cameras', /\b(cameras?|dslr|mirrorless|gopro|insta360|tripod|gimbal|drone|dji|instax|camera lens|dslr lens|lens hood)\b/i],
  ['Electronics > Gaming', /\b(ps[345]|playstation|xbox|nintendo|game ?pad|joystick|controller|gaming (chair|desk|mouse|keyboard|headset)|console)\b/i],
  ['Electronics > Cameras', /\b(lens|nikkor|fujinon|f\/\d(\.\d)?|mirrorless|camera bag)\b/i],
  ['Electronics > Projectors', /\b(projectors?|lumens|screen casting)\b/i],
  ['Electronics > Computer accessories', /\b(keyboards?|mouse|mice|mouse pad|wrist rest|monitor|router|repeater|wifi|wi-fi|access point|d-link|tp-link|power supplies|power supply|motherboards?|graphics cards?|headset|microphone|dvd|webcam|laptop stand|usb hub|webcam|ssd|hard ?drive|flash drive|usb drive|memory card|sd card|ram \d|printer|ink|toner|ups\b|motherboard|graphics card|processor|cooling fan)\b/i],
  ['Electronics > Solar & power', /\b(car inverter|solar|hybrid inverter|ups inverter|ups battery|lithium battery|tubular battery|panel \d+ ?w|voltage stabilizer|generator)\b/i],
  // appliances
  ['Home appliances > Air conditioners', /\b(air conditioner|split ac|inverter ac|\bac\b|\d(\.\d)? ?ton)\b/i],
  ['Home appliances > Refrigerators & freezers', /\b(refrigerators?|fridge|deep freezer|freezer)\b/i],
  ['Home appliances > Washing machines', /\b(washing machines?|washer|dryer|spin dryer)\b/i],
  ['Home appliances > Fans & coolers', /\b(ceiling fan|pedestal fan|bracket fan|exhaust fan|air cooler|room cooler|fans?\b|cooler)\b/i],
  ['Home appliances > Water heaters & geysers', /\b(geysers?|water heater|gas geyser|instant geyser)\b/i],
  ['Home appliances > Heaters', /\b(heaters?|room heater|gas heater|electric heater)\b/i],
  ['Home appliances > Kitchen appliances', /\b(microwave|oven|air fryer|blender|juicer|chopper|toaster|kettle|rice cooker|food processor|hand mixer|coffee maker|grill|sandwich maker|induction|cooking range|hob|hood|dishwasher|water dispenser)\b/i],
  ['Home appliances > Cleaning', /\b(vacuum|iron\b|steam iron|garment steamer|mop)\b/i],
  // kitchen & home
  ['Home & kitchen > Cutlery & spoons', /\b(spoons?|forks?|knife|knives|cutlery|chamach|ladle|spatula|serving set|tongs)\b/i],
  ['Home & kitchen > Cookware', /\b(pots?|pans?|frying|wok|cookware|pressure cooker|karahi|tawa|casserole|hot ?pot|steamer|non[- ]?stick)\b/i],
  ['Home & kitchen > Dinnerware & drinkware', /\b(plates?|bowls?|cups?|mugs?|glass set|dinner set|tea set|tumbler|jug|bottle|flask|thermos|lunch box|water bottle)\b/i],
  ['Home & kitchen > Storage & organisers', /\b(storage|organi[sz]er|container|rack|shelf|basket|hanger|bin)\b/i],
  ['Home > Furniture', /\b(sofa|bed\b|mattress|wardrobe|dining table|table\b|chair|desk|cabinet|bookshelf|shoe rack|dresser|couch|stool|bench|recliner)\b/i],
  ['Home > Bedding & bath', /\b(bed ?sheets?|bed ?spreads?|comforter|duvet|quilt|pillow|blanket|towels?|cushion|bath mat|razai|khes)\b/i],
  ['Home > Curtains, carpets & decor', /\b(curtains?|carpet|rug|wall (art|clock|decor)|photo frame|vase|artificial (plant|flower)|candle|decor)\b/i],
  ['Home > Lighting', /\b(led (bulb|light|strip)|bulbs?|lamp|chandelier|tube light|fairy lights|lighting)\b/i],
  // fashion
  ['Fashion > Innerwear & nightwear', /\b(pj|pjs|pyjama|loungewear|night ?dress|night ?suit|nightwear|camisoles?|bralette|bra\b|panties|panty|thong|body shapers?|undergarments?|lingerie|innerwear|boxers?|briefs?|vest|socks?)\b/i],
  ['Fashion > Footwear', /\b(pumps?|shoes?|sneakers?|sandals?|slippers?|chappal|khussa|boots?|heels|loafers|flip ?flops|joota|sports shoes|running shoes)\b/i],
  ['Fashion > Women > Unstitched fabric', /\b(\d ?pc|\d ?pcs|\d[- ]piece|piece suit|ladies suit|unstitched suit|embroidered suit|eastern wear)\b/i],
  ['Fashion > Women > Unstitched fabric', /\b(unstitched|lawn|karandi|khaddar|chiffon suit|3 ?pc unstitched|2 ?pc unstitched|fabric|cambric)\b/i],
  ['Fashion > Women > Ready to wear', /\b(rtw|ready to wear|kurta|kurti|shalwar kameez women|co-?ord|tunic|abaya|hijab|scarf|dupatta|stole|shawl|maxi|gown|lehenga|saree|frock|peplum|trouser women|women'?s (shirt|top|suit))\b/i],
  ['Fashion > Men > Shalwar kameez & kurta', /\b(shalwar|kameez|men'?s kurta|waistcoat|sherwani|prince coat|wash ?& ?wear|kurta pajama)\b/i],
  ['Fashion > Men > Shirts & t-shirts', /\b(t-?shirts?|polo|shirts?|henley|tank top)\b/i],
  ['Fashion > Men > Jeans & trousers', /\b(jeans|denim|chinos|trousers?|cargo|joggers|shorts|pants)\b/i],
  ['Fashion > Winter wear', /\b(hoodie|sweatshirt|sweater|jacket|coat|puffer|cardigan|fleece|jersey|muffler|gloves|beanie|thermal)\b/i],
  ['Fashion > Kids clothing', /\b(kids?|boys?|girls?|baby|infant|toddler) ?(wear|suit|frock|dress|shirt|set|romper|clothes)\b/i],
  ['Fashion > Innerwear & socks', /\b(socks?|underwear|boxers?|briefs?|bra\b|vest|lingerie|innerwear|nightwear|pajamas?)\b/i],
  ['Fashion > Footwear', /\b(shoes?|sneakers?|sandals?|slippers?|chappal|khussa|boots?|heels|loafers|flip ?flops|joota|peshawari|kolhapuri|sports shoes|running shoes)\b/i],
  ['Fashion > Bags & wallets', /\b(bags?|backpack|handbag|wallet|purse|clutch|tote|luggage|suitcase|trolley|laptop bag|sling)\b/i],
  ['Fashion > Watches', /\b(watch(es)?|wrist ?watch|chronograph|casio|g-?shock|seiko|citizen)\b/i],
  ['Fashion > Jewellery', /\b(locket|jewel+ery|necklace|earrings?|rings?|bracelet|bangles?|pendant|chain|tikka|nose pin|anklet|gold plated|artificial jewel+ery)\b/i],
  // eyewear
  // beauty & health
  ['Beauty > Perfume & fragrance', /\b(perfumes?|parfum|eau de|edp|edt|cologne|fragrance|attar|itar|body spray|deodorant|bakhoor|oud|musk)\b/i],
  ['Beauty > Makeup', /\b(lipstick|foundation|mascara|eyeliner|kajal|blush|highlighter|compact|concealer|nail polish|makeup|eyeshadow|primer|lip gloss|lip balm|brush set)\b/i],
  ['Beauty > Skincare', /\b(face wash|cleanser|moisturi[sz]er|serum|sunscreen|sunblock|toner|face mask|cream|lotion|whitening|anti-?acne|scrub|night cream|skincare|skin care|vitamin c)\b/i],
  ['Beauty > Hair care', /\b(shampoo|conditioner|hair (oil|mask|serum|color|colour|dye|spray|gel)|hair straightener|hair dryer|curling|trimmer|shaver|razor|beard)\b/i],
  ['Beauty > Bath & body', /\b(soap|body wash|shower gel|hand wash|sanitizer|body (lotion|butter|scrub)|talc|powder|roll[- ]?on|intimate|sanitary|pads)\b/i],
  ['Health > Supplements & medical', /\b(vitamin|supplement|protein|whey|omega|capsules?|tablets? \d|syrup|thermometer|blood pressure|bp monitor|glucometer|oximeter|nebuli[sz]er|mask|first aid|massager|health)\b/i],
  ['Health > Fitness & sports', /\b(dumbbell|yoga|treadmill|gym|exercise|fitness|cricket|bat\b|football|badminton|racket|skipping|sports|helmet|cycle|bicycle|cycling)\b/i],
  // baby, kids, toys
  ['Health > Intimate & wellness', /\b(condoms?|delay spray|lubricant|pregnancy test|knee support|support belt|ankle support|back support|arm cuff|bp\b|blood pressure|posture)\b/i],
  ['Baby & kids > Toys & games', /\b(toys?|blaster|gun\b|monopoly|snake|push n walk|ride[- ]on|game\b|goodie boxes?|lego|puzzle|doll|rc car|remote control car|board game|playset|action figure|building blocks|stuffed|teddy|kids (bike|scooter))\b/i],
  ['Baby & kids > Baby care', /\b(diapers?|pampers|baby (milk|food|lotion|wipes|bottle|stroller|cot|walker|bath|care)|feeder|pacifier|stroller|car seat|nappy|formula|cerelac)\b/i],
  // grocery
  ['Grocery > Atta, rice & pulses', /\b(atta|flour|maida|besan|suji|rice|basmati|chawal|daal|dal\b|lentils?|chana|masoor|moong|mash|lobia|pulses|oats)\b/i],
  ['Grocery > Oil & ghee', /\b(cooking oil|ghee|banaspati|olive oil|canola|sunflower oil|mustard oil|desi ghee|oil\b)\b/i],
  ['Grocery > Sugar, tea & coffee', /\b(sugar|cheeni|jaggery|gur|tea\b|chai|tapal|lipton|coffee|nescafe|green tea|honey)\b/i],
  ['Grocery > Spices & masala', /\b(masala|spices?|mirch|haldi|zeera|salt|namak|shan\b|national\b|garam|paste)\b/i],
  ['Grocery > Dairy & eggs', /\b(milk|dahi|yogurt|butter|cheese|cream\b|eggs?|paneer|doodh|tarang|nestle|olpers)\b/i],
  ['Grocery > Snacks & beverages', /\b(chips|biscuits?|chocolate|candy|snack|juice|soft drink|cola|pepsi|coke|sprite|energy drink|water\b|noodles|pasta|cereal|jam|ketchup|sauce|pickle|dry fruits?|almonds?|cashew|dates|khajoor|nuts)\b/i],
  ['Grocery > Cleaning & laundry', /\b(detergent|surf excel|washing powder|bleach|dish ?wash|floor cleaner|phenyl|harpic|toilet cleaner|air freshener|tissue|napkin|garbage bags|cleaner)\b/i],
  // stationery, books, automotive, tools, pets, gifts
  ['Grocery > Fresh & frozen', /\b(vegetables?|fruits?|frozen|fresh|meat|goat|mutton|beef|chicken|fish|prawn|kidney|liver|mince|keema|tortilla|taco|lasagna|paratha|bread|bun|rolls?|samosa|nuggets?|kebab|pizza|cake|pastry|cookies?)\b/i],
  ['Grocery > Pantry & staples', /\b(pantry|groceries|grocery|staples|essentials|bar\b|chocolatto|float|drink|syrup|jelly|custard|corn ?flakes|ready to eat)\b/i],
  ['Stationery & books > Books', /\b(books?|novel|quran|tafseer|dictionary|guide|notes|past papers|urdu book)\b/i],
  ['Stationery & books > Stationery', /\b(pens?|pencil|notebook|diary|marker|highlighter|stapler|paper|register|files?|calculator|art set|colou?rs|paint|crayons|school bag)\b/i],
  ['Home & kitchen > Cleaning & utility', /\b(broom|dustpan|mop|duster|insect killer|mortein|spray|repair tape|tape\b|sponge|scrubber|bucket|mason jars?|glassware|jars?|vegetable slicer|slicer|peeler|grater|chopper)\b/i],
  ['Beauty > Personal care', /\b(toothbrush|toothpaste|hair clipper|clipper|personal care|hygiene|nail clipper|razor)\b/i],
  ['Automotive > Car & bike accessories', /\b(tyres?|tires?|engine oil|car (cover|mat|seat|perfume|polish|charger|mount|camera|vacuum)|dash ?cam|wiper|brake|battery for car|motorcycle|bike (cover|helmet|accessor|chain|seat)|spark plug|oil filter|air filter)\b/i],
  ['Tools & hardware > Tools', /\b(drill|screwdriver|wrench|tool ?kit|hammer|pliers|saw|grinder|welding|ladder|spanner|toolbox|power tool|measuring tape|paint brush|hardware|pipe|plumbing|tap\b|faucet|shower)\b/i],
  ['Pets > Pet supplies', /\b(pets?|cat (food|litter)|dog (food|collar|leash)|fish tank|aquarium|bird cage)\b/i],
  ['Gifts & occasions > Gifts', /\b(gifts?|foil balloons?|hamper|bouquet|flowers?|cake|balloon|party|eid|ramadan|wedding|decoration|birthday)\b/i],
]

export const TOP_LEVELS = [...new Set(RULES.map(([p]) => p.split(' > ')[0]!))]

/** Our category path for a listing, or null when no rule places it ("Other"). The store's own label counts first, then the title. */
export function categorize(title: string, storeLabel = ''): string | null {
  const label = storeLabel.trim()
  if (label) for (const [path, re] of RULES) if (re.test(label)) return path
  for (const [path, re] of RULES) if (re.test(title)) return path
  return null
}

/** The searchable and facetable paths of one category: ["Beauty", "Beauty > Perfume & fragrance"] */
export function categoryLevels(path: string | null): string[] {
  if (!path) return ['Other']
  const parts = path.split(' > ')
  return parts.map((_, i) => parts.slice(0, i + 1).join(' > '))
}
