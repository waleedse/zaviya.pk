/**
 * Curated Muslim baby names popular in Pakistan, with Urdu spelling and the commonly
 * accepted meaning. Edit here; the home finder and /baby-names both read this list.
 * `quranic` marks names (or name-words) that appear in the Quran.
 */

export type NameGender = 'boy' | 'girl'
export type NameOrigin = 'Arabic' | 'Persian' | 'Turkish' | 'Urdu' | 'Hebrew' | 'Pashto' | 'Sindhi'

export interface BabyName {
  name: string
  ur: string
  meaning: string
  gender: NameGender
  origin: NameOrigin
  quranic?: boolean
  prophet?: boolean
  trending?: boolean
}

const b = (name: string, ur: string, meaning: string, origin: NameOrigin = 'Arabic', flags: Partial<Pick<BabyName, 'quranic' | 'prophet' | 'trending'>> = {}): BabyName => ({ name, ur, meaning, gender: 'boy', origin, ...flags })
const g = (name: string, ur: string, meaning: string, origin: NameOrigin = 'Arabic', flags: Partial<Pick<BabyName, 'quranic' | 'prophet' | 'trending'>> = {}): BabyName => ({ name, ur, meaning, gender: 'girl', origin, ...flags })

export const BABY_NAMES: BabyName[] = [
  b('Muhammad', 'محمد', 'Praised, commendable', 'Arabic', { quranic: true }),
  g('Fatima', 'فاطمہ', 'One who abstains; daughter of the Prophet'),
  b('Ayaan', 'ایان', 'Gift of God', 'Arabic', { trending: true }),
  g('Hoorain', 'حورین', 'Maidens of Paradise', 'Arabic', { trending: true }),
  b('Zayan', 'زیان', 'Beauty, grace', 'Arabic', { trending: true }),
  g('Eshaal', 'ایشال', 'Flower of Paradise', 'Urdu', { trending: true }),
  b('Arham', 'ارحم', 'Most merciful', 'Arabic', { trending: true }),
  g('Inaya', 'عنایہ', 'Care, kindness', 'Arabic', { trending: true }),
  b('Hadi', 'ہادی', 'Guide, one who leads', 'Arabic', { quranic: true, trending: true }),
  g('Ayesha', 'عائشہ', 'Alive, prosperous'),
  b('Ahmad', 'احمد', 'Most praiseworthy', 'Arabic', { quranic: true }),
  g('Maryam', 'مریم', 'Mother of Prophet Isa; pious', 'Hebrew', { quranic: true }),
  b('Ali', 'علی', 'Exalted, noble'),
  g('Zainab', 'زینب', 'Fragrant flower'),
  b('Rayyan', 'ریان', 'Gate of Paradise for those who fast', 'Arabic', { trending: true }),
  g('Mahnoor', 'ماہ نور', 'Light of the moon', 'Persian', { trending: true }),
  b('Hamza', 'حمزہ', 'Steadfast, strong'),
  g('Hania', 'ہانیہ', 'Happy, delighted'),
  b('Ibrahim', 'ابراہیم', 'Name of a prophet', 'Hebrew', { quranic: true, prophet: true }),
  g('Ayat', 'آیت', 'Sign, verse', 'Arabic', { quranic: true }),
  b('Abdullah', 'عبداللہ', 'Servant of Allah'),
  g('Khadija', 'خدیجہ', 'Early-born child; wife of the Prophet'),
  b('Yusuf', 'یوسف', 'Name of a prophet', 'Hebrew', { quranic: true, prophet: true }),
  g('Noor', 'نور', 'Light', 'Arabic', { quranic: true }),
  b('Hassan', 'حسن', 'Good, handsome'),
  g('Areeba', 'اریبہ', 'Smart, intelligent'),
  b('Hussain', 'حسین', 'Good, handsome one'),
  g('Hareem', 'حریم', 'Sacred place'),
  b('Umar', 'عمر', 'Long-lived, flourishing'),
  g('Amna', 'آمنہ', 'Safe, secure; mother of the Prophet'),
  b('Ertugrul', 'ارطغرل', 'Brave warrior', 'Turkish', { trending: true }),
  g('Huda', 'ہدیٰ', 'Guidance', 'Arabic', { quranic: true }),
  b('Haider', 'حیدر', 'Lion'),
  g('Imaan', 'ایمان', 'Faith', 'Arabic', { quranic: true }),
  b('Musa', 'موسیٰ', 'Name of a prophet', 'Hebrew', { quranic: true, prophet: true }),
  g('Jannat', 'جنت', 'Paradise', 'Arabic', { quranic: true }),
  b('Isa', 'عیسیٰ', 'Name of a prophet', 'Hebrew', { quranic: true, prophet: true }),
  g('Hafsa', 'حفصہ', 'Young lioness; wife of the Prophet'),
  b('Yahya', 'یحییٰ', 'Name of a prophet; living', 'Arabic', { quranic: true, prophet: true }),
  g('Ruqayya', 'رقیہ', 'Gentle; daughter of the Prophet'),
  b('Ismail', 'اسماعیل', 'Name of a prophet; God hears', 'Hebrew', { quranic: true, prophet: true }),
  g('Hajra', 'ہاجرہ', 'Wife of Prophet Ibrahim'),
  b('Sulaiman', 'سلیمان', 'Name of a prophet; peaceful', 'Hebrew', { quranic: true, prophet: true }),
  g('Aasiya', 'آسیہ', 'One who tends to the weak'),
  b('Dawood', 'داؤد', 'Name of a prophet; beloved', 'Hebrew', { quranic: true, prophet: true }),
  g('Sumaiya', 'سمیہ', 'High, elevated'),
  b('Haroon', 'ہارون', 'Name of a prophet', 'Hebrew', { quranic: true, prophet: true }),
  g('Javeria', 'جویریہ', 'Wife of the Prophet'),
  b('Yunus', 'یونس', 'Name of a prophet', 'Hebrew', { quranic: true, prophet: true }),
  g('Rumaisa', 'رمیسہ', 'Name of a companion of the Prophet'),
  b('Idris', 'ادریس', 'Name of a prophet', 'Arabic', { quranic: true, prophet: true }),
  g('Iqra', 'اقرا', 'Read; the first word revealed', 'Arabic', { quranic: true }),
  b('Zakariya', 'زکریا', 'Name of a prophet', 'Hebrew', { quranic: true, prophet: true }),
  g('Sidra', 'سدرہ', 'Lote tree of the farthest boundary', 'Arabic', { quranic: true }),
  b('Taha', 'طٰہٰ', 'Opening letters of Surah Taha', 'Arabic', { quranic: true }),
  g('Tuba', 'طوبیٰ', 'Blessedness; a tree in Paradise', 'Arabic', { quranic: true }),
  b('Yaseen', 'یٰسین', 'Opening letters of Surah Yaseen', 'Arabic', { quranic: true }),
  g('Kausar', 'کوثر', 'Abundance; a river in Paradise', 'Arabic', { quranic: true }),
  b('Imran', 'عمران', 'Prosperity; family of Imran', 'Arabic', { quranic: true }),
  g('Dua', 'دعا', 'Prayer'),
  b('Rehan', 'ریحان', 'Sweet basil; fragrance', 'Arabic', { quranic: true }),
  g('Hira', 'حرا', 'The cave of the first revelation'),
  b('Muneeb', 'منیب', 'One who turns to Allah', 'Arabic', { quranic: true }),
  g('Zoya', 'زویا', 'Alive, radiant', 'Persian'),
  b('Mustafa', 'مصطفیٰ', 'The chosen one'),
  g('Zara', 'زارا', 'Princess; radiance'),
  b('Usman', 'عثمان', 'Name of the third Caliph'),
  g('Sana', 'ثناء', 'Praise'),
  b('Bilal', 'بلال', 'Freshness; companion of the Prophet'),
  g('Kinza', 'کنزہ', 'Hidden treasure'),
  b('Talha', 'طلحہ', 'Fruitful tree; companion of the Prophet'),
  g('Mishal', 'مشعل', 'Torch, light'),
  b('Saad', 'سعد', 'Good fortune'),
  g('Manahil', 'مناہل', 'Springs of fresh water'),
  b('Zaid', 'زید', 'Growth, abundance'),
  g('Hiba', 'ہبہ', 'Gift'),
  b('Khalid', 'خالد', 'Eternal'),
  g('Rabia', 'رابعہ', 'Fourth; a famous saint'),
  b('Fahad', 'فہد', 'Panther'),
  g('Mahira', 'ماہرہ', 'Skilful'),
  b('Faris', 'فارس', 'Knight, horseman'),
  g('Mehwish', 'مہوش', 'Like the moon', 'Persian'),
  b('Waleed', 'ولید', 'Newborn'),
  g('Laiba', 'لائبہ', 'Angel of Paradise'),
  b('Junaid', 'جنید', 'Soldier, warrior'),
  g('Aylin', 'آئلین', 'Halo of the moon', 'Turkish', { trending: true }),
  b('Azlan', 'ازلان', 'Lion', 'Turkish', { trending: true }),
  g('Elif', 'ایلف', 'Slender; first letter of the alphabet', 'Turkish'),
  b('Shahzain', 'شاہ زین', 'Pride of the king', 'Persian'),
  g('Gulalai', 'گلالئی', 'Like a flower', 'Pashto'),
  b('Shayan', 'شایان', 'Worthy, deserving', 'Persian'),
  g('Marvi', 'ماروی', 'Folk heroine of Sindh', 'Sindhi'),
  b('Rohaan', 'روحان', 'Spiritual', 'Urdu'),
  b('Danish', 'دانش', 'Knowledge, wisdom', 'Persian'),
  b('Saif', 'سیف', 'Sword'),
  b('Azaan', 'اذان', 'Call to prayer'),
  b('Affan', 'عفان', 'Chaste, modest'),
  b('Hashir', 'حاشر', 'Gatherer; a name of the Prophet'),
  b('Noman', 'نعمان', 'Blessing, bounty'),
  b('Raza', 'رضا', 'Contentment, approval'),
]

export const NAME_ORIGINS: NameOrigin[] = ['Arabic', 'Persian', 'Turkish', 'Urdu', 'Hebrew', 'Pashto', 'Sindhi']

export function trendingNames(limit = 10): BabyName[] {
  return BABY_NAMES.filter((n) => n.trending).slice(0, limit)
}
