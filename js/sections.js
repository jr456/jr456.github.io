// Supermarket sections + auto-bucketing logic.
//
// Each section has an icon, sort order (roughly the order you walk a store),
// and a list of keywords. Multi-word keywords win over single-word ones, and
// longer keywords win over shorter, so "ice cream" → Frozen (not Dairy via
// "cream") and "sour cream" stays in Dairy.

export const SECTIONS = [
  { id: "produce",     name: "Produce",         icon: "🥬", order: 1 },
  { id: "bakery",      name: "Bakery",          icon: "🥖", order: 2 },
  { id: "deli",        name: "Deli",            icon: "🧆", order: 3 },
  { id: "meat",        name: "Meat & Seafood",  icon: "🥩", order: 4 },
  { id: "dairy",       name: "Dairy & Eggs",    icon: "🥛", order: 5 },
  { id: "frozen",      name: "Frozen",          icon: "🧊", order: 6 },
  { id: "pantry",      name: "Pantry",          icon: "🥫", order: 7 },
  { id: "snacks",      name: "Snacks",          icon: "🍪", order: 8 },
  { id: "beverages",   name: "Beverages",       icon: "🧃", order: 9 },
  { id: "alcohol",     name: "Beer & Wine",     icon: "🍷", order: 10 },
  { id: "household",   name: "Household",       icon: "🧻", order: 11 },
  { id: "personal",    name: "Personal Care",   icon: "🧴", order: 12 },
  { id: "baby",        name: "Baby",            icon: "🍼", order: 13 },
  { id: "pet",         name: "Pet",             icon: "🐾", order: 14 },
  { id: "other",       name: "Other",           icon: "🛍️", order: 99 },
];

export const SECTIONS_BY_ID = Object.fromEntries(SECTIONS.map(s => [s.id, s]));

// keyword → sectionId. Add liberally — match is case-insensitive whole-word.
const KEYWORDS = {
  produce: [
    "apple", "apples", "banana", "bananas", "lettuce", "romaine", "iceberg",
    "tomato", "tomatoes", "onion", "onions", "scallion", "shallot",
    "potato", "potatoes", "sweet potato", "yam", "carrot", "carrots",
    "broccoli", "cauliflower", "spinach", "arugula", "kale", "cabbage",
    "cucumber", "zucchini", "squash", "pumpkin",
    "pepper", "peppers", "bell pepper", "jalapeno", "chili", "chile",
    "garlic", "ginger", "lemon", "lemons", "lime", "limes",
    "orange", "oranges", "clementine", "mandarin", "grapefruit",
    "grape", "grapes", "berries", "berry", "strawberry", "strawberries",
    "blueberry", "blueberries", "raspberry", "raspberries", "blackberry",
    "avocado", "avocados", "mushroom", "mushrooms", "celery", "asparagus",
    "corn", "peas", "green bean", "green beans", "edamame",
    "herbs", "parsley", "cilantro", "basil", "mint", "rosemary", "thyme",
    "dill", "chives", "sage", "fruit", "vegetable", "vegetables", "veggies",
    "salad", "salad mix", "kiwi", "mango", "pineapple", "papaya", "melon",
    "watermelon", "cantaloupe", "honeydew", "peach", "peaches", "pear", "pears",
    "plum", "plums", "cherry", "cherries", "fig", "date", "pomegranate",
    "leek", "fennel", "radish", "beet", "beets", "turnip", "parsnip",
    "eggplant", "okra", "artichoke", "brussels sprouts",
  ],
  bakery: [
    "bread", "loaf", "sourdough", "rye", "baguette", "ciabatta", "focaccia",
    "bagel", "bagels", "english muffin", "muffin", "muffins", "croissant",
    "danish", "scone", "roll", "rolls", "bun", "buns", "hot dog bun",
    "hamburger bun", "pita", "naan", "tortilla", "tortillas", "wrap",
    "pastry", "pastries", "donut", "doughnut", "pie crust", "puff pastry",
  ],
  deli: [
    "deli", "prosciutto", "salami", "pepperoni", "mortadella", "capicola",
    "pastrami", "corned beef", "smoked turkey", "sliced turkey",
    "sliced ham", "lunch meat", "cold cuts", "hummus", "tzatziki",
    "olives", "antipasto",
  ],
  meat: [
    "chicken", "chicken breast", "chicken thigh", "chicken wing", "chicken wings",
    "beef", "ground beef", "steak", "ribeye", "sirloin", "filet", "brisket",
    "pork", "pork chop", "pork loin", "pork belly", "lamb", "lamb chop",
    "veal", "turkey", "ground turkey", "duck", "fish", "salmon", "cod",
    "halibut", "tuna steak", "trout", "tilapia", "mackerel", "sardine",
    "shrimp", "prawns", "scallops", "crab", "lobster", "mussels", "clams",
    "bacon", "sausage", "sausages", "chorizo", "ham", "kielbasa",
    "ground", "meatballs",
  ],
  dairy: [
    "milk", "whole milk", "skim milk", "almond milk", "oat milk", "soy milk",
    "cheese", "cheddar", "mozzarella", "parmesan", "feta", "brie", "gouda",
    "swiss cheese", "blue cheese", "goat cheese", "ricotta", "cottage cheese",
    "cream cheese", "sour cream", "yogurt", "greek yogurt", "kefir",
    "butter", "ghee", "margarine", "cream", "heavy cream", "half and half",
    "creamer", "egg", "eggs", "milk alternative",
  ],
  frozen: [
    "frozen", "ice cream", "gelato", "sorbet", "popsicle", "popsicles",
    "ice", "ice cubes", "frozen pizza", "frozen vegetables", "frozen fruit",
    "frozen berries", "frozen meal", "frozen meals", "tv dinner",
    "frozen waffles", "frozen dinner", "frozen yogurt",
  ],
  pantry: [
    "rice", "brown rice", "white rice", "jasmine rice", "basmati", "arborio",
    "pasta", "spaghetti", "penne", "rigatoni", "linguine", "fettuccine",
    "lasagna", "macaroni", "noodles", "ramen", "udon", "soba",
    "flour", "all-purpose flour", "whole wheat flour", "almond flour",
    "sugar", "brown sugar", "powdered sugar", "salt", "kosher salt",
    "pepper", "black pepper", "spice", "spices", "cinnamon", "cumin",
    "paprika", "oregano", "garlic powder", "onion powder", "chili powder",
    "vanilla", "baking soda", "baking powder", "yeast",
    "oil", "olive oil", "vegetable oil", "canola oil", "coconut oil",
    "vinegar", "balsamic", "soy sauce", "fish sauce", "hot sauce", "sriracha",
    "ketchup", "mustard", "mayo", "mayonnaise", "salsa", "pesto",
    "sauce", "tomato sauce", "tomato paste", "marinara",
    "soup", "broth", "stock", "bouillon",
    "beans", "black beans", "kidney beans", "chickpeas", "garbanzo",
    "lentils", "chili beans", "refried beans",
    "oats", "oatmeal", "cereal", "granola", "muesli",
    "peanut butter", "almond butter", "nutella", "jam", "jelly",
    "honey", "maple syrup", "syrup", "molasses",
    "canned", "tuna", "anchovies", "coconut milk", "evaporated milk",
    "condensed milk", "tomatoes canned", "diced tomatoes",
    "stuffing", "couscous", "quinoa", "barley", "polenta", "grits",
    "breadcrumbs", "panko",
  ],
  snacks: [
    "chips", "tortilla chips", "potato chips", "pretzels", "popcorn",
    "crackers", "goldfish", "rice cakes",
    "cookies", "biscuits", "oreo", "candy", "chocolate", "chocolate bar",
    "gum", "mints", "nuts", "almonds", "cashews", "peanuts", "walnuts",
    "pistachios", "trail mix", "granola bar", "granola bars", "protein bar",
    "fruit snacks", "snack",
  ],
  beverages: [
    "water", "sparkling water", "seltzer", "soda", "pop", "coke", "pepsi",
    "sprite", "ginger ale", "juice", "orange juice", "apple juice",
    "lemonade", "iced tea", "tea", "green tea", "black tea", "herbal tea",
    "coffee", "ground coffee", "coffee beans", "espresso",
    "energy drink", "gatorade", "sports drink", "kombucha",
    "milk substitute drink",
  ],
  alcohol: [
    "beer", "ipa", "lager", "stout", "cider",
    "wine", "red wine", "white wine", "rose", "prosecco", "champagne",
    "whiskey", "bourbon", "scotch", "vodka", "gin", "rum", "tequila",
    "liquor", "spirits",
  ],
  household: [
    "paper towel", "paper towels", "toilet paper", "tissues", "kleenex",
    "napkins", "detergent", "laundry detergent", "dish soap", "dishwasher",
    "dishwasher pods", "fabric softener", "bleach", "stain remover",
    "soap", "hand soap", "sponge", "sponges", "scrub", "trash bag",
    "trash bags", "garbage bag", "garbage bags", "foil", "aluminum foil",
    "plastic wrap", "saran wrap", "parchment paper", "wax paper",
    "ziploc", "ziplock", "freezer bag", "sandwich bag", "bag", "bags",
    "cleaner", "all purpose cleaner", "windex", "lysol", "clorox",
    "candle", "batteries", "lightbulb", "lightbulbs", "matches", "lighter",
    "broom", "mop",
  ],
  personal: [
    "shampoo", "conditioner", "body wash", "bar soap",
    "toothpaste", "toothbrush", "floss", "mouthwash",
    "deodorant", "antiperspirant", "lotion", "moisturizer", "sunscreen",
    "razor", "razors", "shaving cream", "tampons", "pads",
    "qtips", "cotton balls", "bandaid", "bandaids", "advil", "tylenol",
    "ibuprofen", "acetaminophen", "vitamins", "supplements",
    "makeup", "lipstick", "mascara",
  ],
  baby: [
    "diaper", "diapers", "formula", "baby formula", "wipes", "baby wipes",
    "baby food", "baby lotion", "pacifier", "bottle nipple",
  ],
  pet: [
    "cat food", "dog food", "litter", "cat litter", "pet food",
    "dog treats", "cat treats", "pet treats", "dog toy", "cat toy",
    "kibble",
  ],
};

// Build a lookup: normalized keyword → sectionId. Sort by length desc later
// when matching so "ice cream" beats "cream".
const KW_INDEX = [];
for (const [section, list] of Object.entries(KEYWORDS)) {
  for (const kw of list) {
    KW_INDEX.push({ kw: kw.toLowerCase(), section });
  }
}
KW_INDEX.sort((a, b) => b.kw.length - a.kw.length);

const PUNCT_RE = /[^\p{L}\p{N}\s'-]/gu;

export function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(PUNCT_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleCase(name) {
  return name
    .split(" ")
    .map(w => w.length ? w[0].toUpperCase() + w.slice(1) : w)
    .join(" ");
}

// Auto-bucket an item name into a section id. Returns "other" if nothing matches.
export function suggestSection(rawName) {
  const name = normalizeName(rawName);
  if (!name) return "other";

  // Exact match
  for (const { kw, section } of KW_INDEX) {
    if (kw === name) return section;
  }

  // Word-boundary substring match. KW_INDEX is sorted longest-first, so the
  // first hit wins.
  const padded = ` ${name} `;
  for (const { kw, section } of KW_INDEX) {
    const re = new RegExp(
      `(?:^|[^\\p{L}\\p{N}])${escapeRe(kw)}(?:[^\\p{L}\\p{N}]|$)`,
      "u"
    );
    if (re.test(padded)) return section;
  }

  // Last-word fallback: e.g. "soy milk" → milk → dairy
  const lastWord = name.split(" ").pop();
  for (const { kw, section } of KW_INDEX) {
    if (kw === lastWord) return section;
  }

  return "other";
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
