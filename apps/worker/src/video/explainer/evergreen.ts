/**
 * Evergreen explainers: topics that stay useful, so a quiet round still has something good to make.
 * No dates, prices, phone numbers or laws here on purpose: the script may only use well-established general facts.
 */
export interface Seed {
  title: string
  angle: string
  tags: string[]
}

export const EVERGREEN: Seed[] = [
  { title: 'How to avoid WhatsApp and SMS bank scams', angle: 'Fake bank and wallet messages reach every phone; four habits stop most of them.', tags: ['Scam', 'Cybersecurity', 'Banking'] },
  { title: 'What inflation is and why prices keep rising', angle: 'Why the same salary buys less groceries, in plain words.', tags: ['Inflation', 'Economy'] },
  { title: 'Why the dollar rate changes the price of petrol and groceries', angle: 'Pakistan imports fuel and food, so the exchange rate reaches your kitchen.', tags: ['DollarRate', 'Economy'] },
  { title: 'How ChatGPT and other AI chatbots answer your questions', angle: 'What an AI model really does, and why it sometimes sounds sure but is wrong.', tags: ['AI', 'ChatGPT', 'Technology'] },
  { title: 'How GPS finds your location', angle: 'Satellites, time signals and a bit of geometry behind the blue dot on your map.', tags: ['GPS', 'Technology'] },
  { title: 'How satellites can give internet anywhere', angle: 'Low-orbit satellite internet versus cables and towers.', tags: ['Satellite', 'Internet', 'Technology'] },
  { title: 'How to spot fake news on WhatsApp', angle: 'Forwarded messages spread faster than the truth; five quick checks.', tags: ['FakeNews', 'WhatsApp', 'MediaLiteracy'] },
  { title: 'How online shopping scams work and how to stay safe', angle: 'Too-cheap prices, advance payments and fake pages: the common traps.', tags: ['OnlineShopping', 'Scam'] },
  { title: 'Does a VPN really protect you?', angle: 'What a VPN hides, what it does not, and when it helps.', tags: ['VPN', 'Privacy', 'Cybersecurity'] },
  { title: 'How to make strong passwords and use two-step login', angle: 'The two habits that stop most account hacks.', tags: ['Password', 'Cybersecurity'] },
  { title: 'How a rocket reaches orbit', angle: 'Why going up is not enough: speed sideways is what keeps a satellite in orbit.', tags: ['Space', 'Science'] },
  { title: 'Why your phone battery drains and how to make it last', angle: 'Screen, signal and heat: what really eats the battery.', tags: ['Phone', 'Battery', 'Technology'] },
  { title: 'How solar panels make electricity', angle: 'From sunlight to your socket: panel, inverter and battery explained.', tags: ['Solar', 'Energy'] },
  { title: 'What a stock exchange is and what an index means', angle: 'What happens when the news says the KSE-100 went up or down.', tags: ['PSX', 'StockMarket', 'Economy'] },
  { title: 'How to get paid safely as an online freelancer', angle: 'Clients, escrow and payment platforms: protecting your income.', tags: ['Freelancing', 'OnlineIncome'] },
  { title: 'How Wi-Fi works and why the signal drops', angle: 'Walls, distance and crowded channels, and simple fixes at home.', tags: ['WiFi', 'Internet', 'Technology'] },
  { title: 'What happens when you pay with a card', angle: 'The few seconds between your tap and the shop getting the money.', tags: ['Banking', 'Payments'] },
  { title: 'Why cryptocurrency is risky for ordinary savers', angle: 'What crypto is, why prices swing, and how scams hide in it.', tags: ['Crypto', 'Scam', 'Economy'] },
  { title: 'How vaccines train your body', angle: 'A simple look at how a vaccine prepares the immune system.', tags: ['Health', 'Vaccines', 'Science'] },
  { title: 'Why smog covers Lahore and other cities in winter', angle: 'Smoke, traffic, industry and cold still air: the ingredients of smog.', tags: ['Smog', 'Environment', 'Lahore'] },
  { title: 'How to stay safe in extreme heat', angle: 'Heat stroke signs and what to do, in simple steps.', tags: ['Heatwave', 'Health'] },
  { title: 'How to check if a website is safe', angle: 'The padlock is not proof: what to look at before you enter your details.', tags: ['Cybersecurity', 'Internet'] },
  { title: 'How AI voices and fake videos can fool you', angle: 'Deepfakes in plain words, and how to check before you share.', tags: ['Deepfake', 'AI', 'FakeNews'] },
  { title: 'How loan interest really works', angle: 'Simple versus compound interest, and why the total is more than the loan.', tags: ['Loan', 'Banking', 'Economy'] },
  { title: 'Why earthquakes happen and why Pakistan feels them', angle: 'Plates, fault lines and what to do when the ground shakes.', tags: ['Earthquake', 'Science', 'Safety'] },
  { title: 'How to protect your children online', angle: 'Simple settings and talks that keep young people safer on phones.', tags: ['Parenting', 'Cybersecurity'] },
  { title: 'How a black hole is born and why nothing escapes it', angle: 'What happens to a huge dying star, and what "no escape" really means.', tags: ['BlackHole', 'Space', 'Science'] },
  { title: 'How airplanes stay in the air', angle: 'Lift, speed and wings in plain words, and why a plane does not just fall.', tags: ['Airplane', 'Science', 'Aviation'] },
  { title: 'How Face ID and fingerprint unlock really work', angle: 'What your phone remembers about you and where that data stays.', tags: ['FaceID', 'Phone', 'Technology'] },
  { title: 'What quantum computers are and what they will change', angle: 'Why scientists are excited, and what they cannot do yet.', tags: ['Quantum', 'Technology', 'Science'] },
  { title: 'How Bitcoin mining works and why it uses so much electricity', angle: 'What miners actually do and why the machines never rest.', tags: ['Bitcoin', 'Crypto', 'Technology'] },
  { title: 'How self-driving cars see the road', angle: 'Cameras, radar and software: how a car decides to brake.', tags: ['SelfDriving', 'Tesla', 'Technology'] },
  { title: 'Why the sky is blue and sunsets are red', angle: 'One simple idea about light explains both.', tags: ['Science', 'Sky', 'Nature'] },
  { title: 'How a cricket ball swings in the air', angle: 'The science behind swing and reverse swing that bowlers use.', tags: ['Cricket', 'Science', 'Swing'] },
  { title: 'How a tsunami forms and why the sea pulls back first', angle: 'From an undersea earthquake to a wall of water.', tags: ['Tsunami', 'Science', 'Nature'] },
  { title: 'How the internet reaches your phone from another country', angle: 'Undersea cables, data centres and the path of a single message.', tags: ['Internet', 'Cables', 'Technology'] },
  { title: 'How AI makes images and videos from a sentence', angle: 'What happens between your words and the picture, in simple steps.', tags: ['AI', 'GenerativeAI', 'Technology'] },
  { title: 'Why we dream and what the brain does while we sleep', angle: 'Sleep stages, memory and the strange stories we see at night.', tags: ['Dreams', 'Sleep', 'Science'] },
  { title: 'How a rocket lands itself and why that saves millions', angle: 'The trick behind reusable rockets.', tags: ['SpaceX', 'Rocket', 'Space'] },
]
