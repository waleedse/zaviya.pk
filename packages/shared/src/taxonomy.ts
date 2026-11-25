/**
 * Category tree for product search and the prices pages (docs/PRODUCT-SEARCH.md section 11). Rules only: the store's own category label and the
 * title are matched against keyword rules, most specific first. Nothing is sent to an AI here; products no rule places stay "Other" and are counted.
 * Paths go up to four levels ("Electronics > Audio > Earbuds & headphones > Wireless earbuds"); every level is a page (/prices/c/<slugs>).
 */
/** Bump when RULES change: the sync classifies every listing again */
export const TAXONOMY_VERSION = 4

const RULES: [string, RegExp][] = [
  // pharmacy first: "TAB 500MG", "SYP", "SACHET" titles would otherwise land in tablets, oil or snacks
  ['Health > Medicines > Tablets & capsules', /\b(tab|tabs|tablets?|caps?|capsules?)\b[^a-z]{0,6}\d+\s?(mg|mcg)\b|\b\d+\s?(mg|mcg)\b.*\b(tab|tabs|caps?)\b|\b(tab|cap)\s+\d+\s?mg/i],
  ['Health > Medicines > Syrups & drops', /\b(syp|susp|suspension|elixir|eye drops|ear drops|nasal drops)\b|\(rx\)/i],
  ['Health > Medicines > Injections, ointments & sachets', /\b(inj|injection|sachet|ointment|testosterone)\b/i],
  // eyewear
  ['Eyewear > Contact lenses', /\b(contact lens(es)?|lens solution|colou?red lens)\b/i],
  ['Eyewear > Sunglasses', /\b(sun ?glasses?|shades|polari[sz]ed|aviator|wayfarer|ray-?ban|oakley)\b/i],
  ['Eyewear > Frames & glasses', /\b(eye ?glasses|spectacles?|optical frames?|eyewear|reading glasses|blue ?light|prescription|glasses|chasma|frames?)\b/i],
  // mobiles
  ['Electronics > Mobile phones > Accessories > Cases & covers', /\b(phone|mobile|iphone|samsung|galaxy|redmi|infinix|tecno|vivo|oppo|realme|airpods?|ipad)\b.*\b(cases?|covers?)\b|\b(cases?|covers?)\b.*\b(phone|mobile|iphone|samsung|galaxy|redmi|infinix|tecno|vivo|oppo|realme|airpods?|ipad)\b|\b(back skin|pop ?socket|phone cases?|mobile covers?)\b/i],
  ['Electronics > Mobile phones > Accessories > Screen protectors', /\b(screen protectors?|tempered|glass protector|privacy glass)\b/i],
  ['Electronics > Mobile phones > Accessories > Power banks', /\b(power ?banks?)\b/i],
  ['Electronics > Mobile phones > Accessories > Chargers & cables', /\b(charger|charging|cable|adapter|usb[- ]?c|lightning|type[- ]?c|wall plug)\b/i],
  ['Electronics > Mobile phones > Accessories > Holders & selfie sticks', /\b(selfie stick|mobile holder|phone holder|car mount|ring light)\b/i],
  ['Electronics > Mobile phones > Keypad phones', /\b(keypad phone|feature phone|nokia (105|106|110|130|150|2660|3310)|itel (it|ace)\d*|qmobile|g'?five)\b/i],
  ['Electronics > Mobile phones > Smartphones', /\b(iphone|galaxy [asmz]\d+|galaxy (note|fold|flip)|redmi|poco|infinix|tecno|vivo|oppo|realme|honor|itel|nokia|pixel \d|oneplus|sparx|zte|moto [eg]\d|smart ?phones?|mobile phones?)\b/i],
  ['Electronics > Tablets', /\b(ipad|tablets?|galaxy tab|redmi pad)\b/i],
  // computers
  ['Electronics > Laptops > MacBooks', /\b(macbook)\b/i],
  ['Electronics > Laptops > Gaming laptops', /\b(gaming laptop|rog|tuf gaming|legion|predator|nitro|omen|alienware|katana|victus)\b/i],
  ['Electronics > Laptops > Everyday & business', /\b(laptops?|notebooks?|chromebook|thinkpad|ideapad|vivobook|zenbook|inspiron|latitude|elitebook|probook|aspire|pavilion|vostro)\b/i],
  ['Electronics > Smart watches', /\b(smart ?watch(es)?|fitness (band|tracker)|apple watch|galaxy watch|amazfit|smart band)\b/i],
  ['Home appliances > Fans & coolers', /\b(neck ?fan|mini fan|handheld fan|hand fan|portable fan|usb fan|desk fan)\b/i],
  // audio
  ['Electronics > Audio > Microphones', /\b(microphones?|mic\b|lavalier|podcast mic|wireless mic)\b/i],
  ['Electronics > Audio > Earbuds & headphones > Wireless earbuds', /\b(earbuds?|airpods|tws|buds\b|true wireless)\b/i],
  ['Electronics > Audio > Earbuds & headphones > Neckbands', /\b(neckband|neck band)\b/i],
  ['Electronics > Audio > Earbuds & headphones > Headphones', /\b(head ?phones?|over[- ]ear|on[- ]ear|headsets?)\b/i],
  ['Electronics > Audio > Earbuds & headphones > Wired earphones', /\b(ear ?phones?|hands-?free|in-ear wired|wired earphone)\b/i],
  ['Electronics > Audio > Speakers > Soundbars', /\b(soundbar|sound bar)\b/i],
  ['Electronics > Audio > Speakers > Multimedia & woofers', /\b(woofer|2\.1|multimedia speaker|home theat(er|re)|speaker system)\b/i],
  ['Electronics > Audio > Speakers > Bluetooth speakers', /\b(speakers?|boombox|bluetooth speaker|party speaker)\b/i],
  ['Electronics > TVs', /\b(led tv|smart tv|android tv|oled|qled|television|tv \d{2}|\d{2}["”]? ?(tv|led))\b/i],
  ['Electronics > Cameras > Action cameras & drones', /\b(gopro|insta360|action camera|drone|dji)\b/i],
  ['Electronics > Cameras > Lenses', /\b(camera lens|dslr lens|lens hood|nikkor|fujinon|f\/\d(\.\d)?|\d+mm lens|\bmacro lens)\b/i],
  ['Electronics > Cameras > Tripods & gimbals', /\b(tripod|gimbal|monopod|stabili[sz]er)\b/i],
  ['Electronics > Cameras > Cameras', /\b(cameras?|dslr|mirrorless|instax|camera bag|cctv|security camera|ip camera)\b/i],
  ['Electronics > Gaming', /\b(ps[345]|playstation|xbox|nintendo|game ?pad|joystick|controller|gaming (chair|desk|mouse|keyboard|headset)|console)\b/i],
  ['Electronics > Projectors', /\b(projectors?|lumens|screen casting)\b/i],
  ['Electronics > Computer accessories > Keyboards & mice', /\b(keyboards?|mouse|mice|mouse pad|wrist rest)\b/i],
  ['Electronics > Computer accessories > Networking', /\b(router|repeater|wifi|wi-fi|access point|d-link|tp-link|network switch|lan cable|ethernet)\b/i],
  ['Electronics > Computer accessories > Storage & memory', /\b(ssd|hard ?drive|hdd|flash drive|usb drive|memory card|sd card|micro ?sd|ram \d|ddr[345]|\bram\b)\b/i],
  ['Electronics > Computer accessories > Printers & ink', /\b(printer|ink|toner|cartridge|scanner|3d print(er)?)\b/i],
  ['Electronics > Computer accessories > Monitors', /\b(monitors?|lcd monitor|led monitor|curved monitor)\b/i],
  ['Electronics > Computer accessories > PC parts', /\b(power supplies|power supply|psu|motherboards?|graphics cards?|gpu|processor|cpu|cooling fan|casing|pc case|thermal paste)\b/i],
  ['Electronics > Computer accessories > Other accessories', /\b(dvd|webcam|laptop stand|usb hub|ups\b|laptop bag|cooling pad)\b/i],
  ['Electronics > Solar & power', /\b(car inverter|solar|hybrid inverter|ups inverter|ups battery|lithium battery|tubular battery|panel \d+ ?w|voltage stabilizer|generator)\b/i],
  // appliances
  ['Home appliances > Air conditioners', /\b(air conditioner|split ac|inverter ac|\bac\b|\d(\.\d)? ?ton)\b/i],
  ['Home appliances > Refrigerators & freezers', /\b(refrigerators?|fridge|deep freezer|freezer)\b/i],
  ['Home appliances > Washing machines', /\b(washing machines?|washer|dryer|spin dryer)\b/i],
  ['Home appliances > Fans & coolers', /\b(ceiling fan|pedestal fan|bracket fan|exhaust fan|air cooler|room cooler|fans?\b|cooler)\b/i],
  ['Home appliances > Water heaters & geysers', /\b(geysers?|water heater|gas geyser|instant geyser)\b/i],
  ['Home appliances > Heaters', /\b(heaters?|room heater|gas heater|electric heater)\b/i],
  ['Home appliances > Kitchen appliances > Microwaves & ovens', /\b(microwave|oven|otg|baking oven)\b/i],
  ['Home appliances > Kitchen appliances > Air fryers', /\b(air fryer|airfryer)\b/i],
  ['Home appliances > Kitchen appliances > Blenders & juicers', /\b(blender|juicer|chopper|food processor|hand mixer|grinder|dough maker)\b/i],
  ['Home appliances > Kitchen appliances > Kettles, toasters & coffee', /\b(kettle|toaster|coffee maker|sandwich maker|grill)\b/i],
  ['Home appliances > Kitchen appliances > Cooking ranges & hobs', /\b(cooking range|hob|hood|induction|stove)\b/i],
  ['Home appliances > Kitchen appliances > Water dispensers', /\b(water dispenser|dispenser)\b/i],
  ['Home appliances > Kitchen appliances > Other kitchen appliances', /\b(rice cooker|dishwasher)\b/i],
  ['Home appliances > Cleaning', /\b(vacuum|iron\b|steam iron|garment steamer|mop)\b/i],
  // kitchen & home
  ['Home & kitchen > Cutlery & spoons', /\b(spoons?|forks?|knife|knives|cutlery|chamach|ladle|spatula|serving set|tongs)\b/i],
  ['Home & kitchen > Cookware > Pressure cookers', /\b(pressure cooker)\b/i],
  ['Home & kitchen > Cookware > Pots & pans', /\b(pots?|pans?|frying|wok|cookware|karahi|tawa|casserole|hot ?pot|steamer|non[- ]?stick)\b/i],
  ['Home & kitchen > Dinnerware & drinkware > Bottles & flasks', /\b(bottle|flask|thermos|water bottle|sipper)\b/i],
  ['Home & kitchen > Dinnerware & drinkware > Dinner & tea sets', /\b(dinner set|tea set|plates?|bowls?|cups?|mugs?|glass set|tumbler|jug|lunch box)\b/i],
  ['Home & kitchen > Storage & organisers', /\b(storage|organi[sz]er|container|rack|shelf|basket|hanger|bin)\b/i],
  ['Home > Furniture', /\b(sofa|bed\b|mattress|wardrobe|dining table|table\b|chair|desk|cabinet|bookshelf|shoe rack|dresser|couch|stool|bench|recliner|highchair)\b/i],
  ['Home > Bedding & bath', /\b(bed ?sheets?|bed ?spreads?|comforter|duvet|quilt|pillow|blanket|towels?|cushion|razai|khes)\b/i],
  ['Home > Mats & doormats', /\b(door ?mats?|bath mat|floor mat|prayer mat|janamaz|mats?\b|runner)\b/i],
  ['Home > Wall art & decor', /\b(canvas(?! ?(shoes?|sneakers?|bags?))|wall ?sticker|wall (art|clock|decor)|painting|photo frame|vase|artificial (plant|flower)|candle|decor|calligraphy)\b/i],
  ['Home > Curtains & carpets', /\b(curtains?|carpet|rug|blinds)\b/i],
  ['Home > Lighting', /\b(led (bulb|light|strip)|bulbs?|lamp|chandelier|tube light|fairy lights|lighting)\b/i],
  // fashion
  ['Fashion > Innerwear & nightwear', /\b(pj|pjs|pyjama|loungewear|night ?dress|night ?suit|nightwear|camisoles?|bralette|bra\b|panties|panty|thong|body shapers?|undergarments?|lingerie|innerwear|boxers?|briefs?|vest|socks?)\b/i],
  ['Fashion > Footwear', /\b(pumps?|shoes?|sneakers?|sandals?|slippers?|chappal|khussa|boots?|heels|loafers|flip ?flops|joota|sports shoes|running shoes|slingback|mules?|peshawari|kolhapuri)\b/i],
  ['Fashion > Kids clothing', /\b(kids?|boys?|girls?|baby|infant|toddler|newborn)'?s? ?(wear|suits?|frock|dress|shirt|sets?|romper|clothes)\b/i],
  ['Fashion > Women > Unstitched fabric', /\b(\d ?pc|\d ?pcs|\d[- ]piece|piece suit|ladies suit|unstitched suit|embroidered suit|eastern wear|d ?#\s?\d+|vol \d+|by aalaya)\b/i],
  ['Fashion > Women > Unstitched fabric', /\b(unstitched|lawn|karandi|khaddar|chiffon suit|fabric|cambric|slub)\b/i],
  ['Fashion > Women > Abaya, hijab & shawls', /\b(abaya|hijab|scarf|stole|shawl|niqab)\b/i],
  ['Fashion > Women > Ready to wear', /\b(rtw|ready to wear|kurta|kurti|shalwar kameez women|co-?ord|tunic|maxi|gown|lehenga|saree|frock|peplum|trouser women|women'?s (shirt|top|suit)|track ?suit|dupatta)\b/i],
  ['Fashion > Men > Shalwar kameez & kurta', /\b(shalwar|kameez|men'?s kurta|waistcoat|sherwani|prince coat|wash ?& ?wear|kurta pajama)\b/i],
  ['Fashion > Men > Blazers & suits', /\b(blazer|suit\b|tuxedo|coat pant)\b/i],
  ['Fashion > Men > Shirts & t-shirts', /\b(t-?shirts?|polo|shirts?|henley|tank top)\b/i],
  ['Fashion > Men > Jeans & trousers', /\b(jeans|denim|chinos|trousers?|cargo|joggers|shorts|pants)\b/i],
  ['Fashion > Men > Pocket squares & ties', /\b(pocket square|ascot|necktie|tie\b|bow tie|cufflinks?)\b/i],
  ['Fashion > Winter wear', /\b(hoodie|sweatshirt|sweater|jacket|coat|puffer|cardigan|fleece|jersey|muffler|gloves|beanie|thermal)\b/i],
  ['Fashion > Hair accessories', /\b(hair ?band|head ?band|hair clips?|scrunchies?|hair accessor(y|ies)|hair pins?|bow headband|hand band)\b/i],
  ['Fashion > Bags & wallets', /\b(bags?|backpack|handbag|wallet|purse|clutch|tote|luggage|suitcase|trolley|sling)\b/i],
  ['Fashion > Watches', /\b(watch(es)?|wrist ?watch|chronograph|casio|g-?shock|seiko|citizen)\b/i],
  ['Fashion > Jewellery', /\b(locket|jewel+e?ry|necklace|earrings?|rings?|bracelet|bangles?|pendant|chain|tikka|nose pin|anklet|gold plated|artificial jewel+ery)\b/i],
  // beauty & health
  ['Beauty > Perfume & fragrance', /\b(perfumes?|parfum|eau de|edp|edt|cologne|fragrance|attar|itar|body spray|deodorant|bakhoor|oud|musk|mukhallat)\b/i],
  ['Beauty > Makeup > Nails & lashes', /\b(nail polish|press on nails?|nail set|false lashes|eyelash|lash|nail art|nail paint)\b/i],
  ['Beauty > Makeup > Lips', /\b(lipstick|lip gloss|lip liner|lip balm|lip tint|labello)\b/i],
  ['Beauty > Makeup > Eyes', /\b(mascara|eyeliner|kajal|eyeshadow|eye shadow|brow)\b/i],
  ['Beauty > Makeup > Face', /\b(foundation|blush|highlighter|compact|concealer|primer|bb cream|setting spray|powder puff)\b/i],
  ['Beauty > Makeup > Brushes & tools', /\b(brush set|makeup brush|crease brush|beauty blender|sponge puff|glitter)\b/i],
  ['Beauty > Skincare > Sunscreen', /\b(sunscreen|sunblock|spf ?\d+)\b/i],
  ['Beauty > Skincare > Serums', /\b(serum|vitamin c|niacinamide|retinol|hyaluronic)\b/i],
  ['Beauty > Skincare > Face wash & cleansers', /\b(face wash|cleanser|micellar)\b/i],
  ['Beauty > Skincare > Moisturisers & creams', /\b(moisturi[sz]er|(?<!ice )cream|lotion|night cream|whitening)\b/i],
  ['Beauty > Skincare > Masks & treatments', /\b(face mask|sheet mask|toner|anti-?acne|scrub|peel|skincare|skin care|wart)\b/i],
  ['Beauty > Hair care', /\b(shampoo|conditioner|hair (oil|mask|serum|color|colour|dye|spray|gel|mousse)|hair straightener|hair dryer|curling|trimmer|shaver|razor|beard|casting cr[eè]me)\b/i],
  ['Beauty > Bath & body', /\b(soap|body wash|shower gel|hand wash|sanitizer|body (lotion|butter|scrub)|talc|(?<!washing |milk |custard )powder|roll[- ]?on|intimate|sanitary|pads|shaving foam)\b/i],
  ['Beauty > Personal care', /\b(toothbrush|toothpaste|mouthwash|oral care|dental|hair clipper|clipper|personal care|hygiene|nail clipper|comb|mirror)\b/i],
  ['Health > Supplements & medical', /\b(vitamin|supplement|protein|whey|omega|calcium|iron tablets|thermometer|blood pressure|bp monitor|glucometer|oximeter|nebuli[sz]er|first aid|massager|health)\b/i],
  ['Health > Fitness & sports', /\b(dumbbell|yoga|treadmill|gym|exercise|fitness|cricket|bat\b|football|badminton|racket|skipping|sports|helmet|cycle|bicycle|cycling)\b/i],
  ['Health > Intimate & wellness', /\b(condoms?|durex|delay spray|lubricant|pregnancy test|knee support|support belt|ankle support|back support|arm cuff|posture)\b/i],
  ['Health > Medical & safety equipment', /\b(safety (equipment|glasses|shoes|gloves|helmet)|3m\b|respirator|face mask|surgical|dental composite|lab coat)\b/i],
  // baby, kids, toys
  ['Baby & kids > Toys & games > RC & die-cast cars', /\b(die-?cast|rc car|remote control car|r\/c|model car|toy car)\b/i],
  ['Baby & kids > Toys & games > Dolls & soft toys', /\b(doll|teddy|stuffed|plush|soft toy)\b/i],
  ['Baby & kids > Toys & games > Games & puzzles', /\b(monopoly|puzzle|board game|lego|building blocks|game\b|cards game)\b/i],
  ['Baby & kids > Toys & games > Other toys', /\b(toys?|blaster|gun\b|push n walk|ride[- ]on|goodie boxes?|playset|action figure|kids (bike|scooter))\b/i],
  ['Baby & kids > Baby care', /\b(diapers?|pampers|baby (milk|food|lotion|wipes|bottle|stroller|cot|walker|bath|care)|feeder|pacifier|soother|stroller|car seat|nappy|formula|cerelac)\b/i],
  // grocery
  ['Grocery > Atta, rice & pulses', /\b(atta|flour|maida|besan|suji|rice|basmati|chawal|daal|dal\b|lentils?|chana|masoor|moong|mash|lobia|pulses|oats)\b/i],
  ['Grocery > Oil & ghee', /\b(cooking oil|ghee|banaspati|olive oil|canola|sunflower oil|mustard oil|desi ghee|oil\b)\b/i],
  ['Grocery > Sugar, tea & coffee', /\b(sugar|cheeni|jaggery|gur|tea\b|chai|tapal|lipton|coffee|nescafe|green tea|honey)\b/i],
  ['Grocery > Spices & masala', /\b(masala|spices?|mirch|haldi|zeera|salt|namak|shan\b|national\b|garam|paste|herbs?)\b/i],
  ['Grocery > Dairy & eggs', /\b(milk|dahi|yogurt|butter|cheese|cream\b|eggs?|paneer|doodh|tarang|nestle|olpers)\b/i],
  ['Grocery > Snacks & beverages', /\b(chips|biscuits?|chocolate|candy|snack|juice|soft drink|cola|pepsi|coke|sprite|energy drink|water\b|noodles|pasta|cereal|jam|ketchup|sauce|pickle|dry fruits?|almonds?|cashew|dates|khajoor|nuts|gulqand|chewing gum)\b/i],
  ['Grocery > Cleaning & laundry', /\b(detergent|surf excel|washing powder|bleach|dish ?wash|floor cleaner|phenyl|harpic|toilet cleaner|air freshener|tissue|napkin|garbage bags|cleaner)\b/i],
  ['Grocery > Fresh & frozen', /\b(vegetables?|fruits?|frozen|fresh|meat|goat|mutton|beef|chicken|fish|prawn|kidney|liver|mince|keema|tortilla|taco|lasagna|paratha|bread|bun|rolls?|samosa|nuggets?|kebab|pizza|cake|pastry|cookies?)\b/i],
  ['Grocery > Pantry & staples', /\b(pantry|groceries|grocery|staples|essentials|bar\b|chocolatto|float|drink|syrup|jelly|custard|corn ?flakes|ready to eat)\b/i],
  ['Grocery > Tobacco', /\b(cigarettes?|tobacco|benson|gold leaf|dunhill|marlboro)\b/i],
  // stationery, books, automotive, tools, building, pets, gifts, media
  ['Stationery & books > Books', /\b(books?|novel|quran|tafseer|dictionary|guide|notes|past papers|urdu book|ece \d+|textbook)\b/i],
  ['Stationery & books > Stationery', /\b(pens?|pencil|notebook|diary|marker|highlighter|stapler|paper|register|files?|calculator|art set|colou?rs|paint|crayons|school bag|sewing thread|thread|rubber bands?)\b/i],
  ['Home & kitchen > Cleaning & utility', /\b(broom|jharoo|dustpan|mop|duster|insect killer|mortein|spray|repair tape|tape\b|sponge|scrubber|bucket|mason jars?|glassware|jars?|vegetable slicer|slicer|peeler|grater|chopper|kitchen set|kitchen ware)\b/i],
  ['Automotive > Car & bike accessories', /\b(tyres?|tires?|engine oil|car (cover|mat|seat|perfume|polish|charger|mount|camera|vacuum)|dash ?cam|wiper|brake|battery for car|motorcycle|bike (cover|helmet|accessor|chain|seat)|spark plug|oil filter|air filter)\b/i],
  ['Tools & industrial > Bearings & CNC parts', /\b(bearings?|linear (guide|motion|guideways?)|ball screws?|cnc|rod end|laser spare|spindle)\b/i],
  ['Tools & industrial > Electrical', /\b(switch(es)?|socket|electric wire|wire\b|cable tray|breaker|mcb|db box|extension board)\b/i],
  ['Tools & industrial > Tools', /\b(drill|screwdriver|wrench|tool ?kit|hammer|pliers|saw|grinder|welding|ladder|spanner|toolbox|power tool|measuring tape|paint brush|hardware|pipe|plumbing|tap\b|faucet|shower|3d scanner)\b/i],
  ['Pets > Pet supplies', /\b(pets?|cat (food|litter)|dog (food|collar|leash)|fish tank|aquarium|bird cage)\b/i],
  ['Gifts & occasions > Trophies & medals', /\b(troph(y|ies)|medals?|shields?|awards?)\b/i],
  ['Gifts & occasions > Gifts & party', /\b(gifts?|foil balloons?|hamper|bouquet|flowers?|cake|balloon|party|eid|ramadan|wedding|decoration|birthday)\b/i],
  ['Media > Movies & digital', /\b(movies?|blu-?ray|dvd movie|animated|season \d|digital download|gift card)\b/i],
]

export const TOP_LEVELS = [...new Set(RULES.map(([p]) => p.split(' > ')[0]!))]

/** Every path the rules can give, with all its parent levels, in rule order (parents before children) */
export const ALL_CATEGORY_PATHS: string[] = (() => {
  const out: string[] = []
  for (const [p] of RULES) for (const l of categoryLevels(p)) if (!out.includes(l)) out.push(l)
  return out
})()

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

/** URL segment of one category name: "Earbuds & headphones" -> "earbuds-headphones" */
export const categorySegment = (name: string) =>
  name.toLowerCase().replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/** /prices/c/<segments> of a path: "Electronics > Audio" -> "electronics/audio" */
export const categoryUrlPath = (path: string) => path.split(' > ').map(categorySegment).join('/')

/** The path whose URL segments are these, or null */
export function categoryFromSegments(segments: string[]): string | null {
  const want = segments.map((s) => s.toLowerCase()).join('/')
  return ALL_CATEGORY_PATHS.find((p) => categoryUrlPath(p) === want) ?? null
}

export const categoryName = (path: string) => path.split(' > ').at(-1)!
export const categoryParent = (path: string) => (path.includes(' > ') ? path.slice(0, path.lastIndexOf(' > ')) : null)
