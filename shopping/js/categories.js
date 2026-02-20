// Auto-categorization engine for supermarket sections
// Maps common grocery items to their store sections

const CATEGORY_KEYWORDS = {
  'Produce': [
    'apple', 'apples', 'banana', 'bananas', 'orange', 'oranges', 'grape', 'grapes',
    'strawberry', 'strawberries', 'blueberry', 'blueberries', 'raspberry', 'raspberries',
    'blackberry', 'blackberries', 'mango', 'mangoes', 'pineapple', 'watermelon', 'cantaloupe',
    'honeydew', 'peach', 'peaches', 'pear', 'pears', 'plum', 'plums', 'cherry', 'cherries',
    'lemon', 'lemons', 'lime', 'limes', 'grapefruit', 'avocado', 'avocados', 'kiwi',
    'tomato', 'tomatoes', 'potato', 'potatoes', 'onion', 'onions', 'garlic', 'ginger',
    'carrot', 'carrots', 'celery', 'broccoli', 'cauliflower', 'spinach', 'kale', 'lettuce',
    'cabbage', 'cucumber', 'cucumbers', 'pepper', 'peppers', 'bell pepper', 'jalapeno',
    'zucchini', 'squash', 'eggplant', 'corn', 'green bean', 'green beans', 'pea', 'peas',
    'mushroom', 'mushrooms', 'asparagus', 'artichoke', 'beet', 'beets', 'radish', 'radishes',
    'turnip', 'sweet potato', 'sweet potatoes', 'yam', 'parsley', 'cilantro', 'basil', 'mint',
    'dill', 'rosemary', 'thyme', 'sage', 'chive', 'chives', 'scallion', 'scallions',
    'green onion', 'green onions', 'shallot', 'leek', 'arugula', 'romaine', 'sprout', 'sprouts',
    'fruit', 'vegetable', 'vegetables', 'salad', 'herb', 'herbs', 'berries', 'melon',
    'clementine', 'clementines', 'tangerine', 'nectarine', 'papaya', 'pomegranate',
    'fig', 'figs', 'date', 'dates', 'coconut', 'plantain'
  ],

  'Dairy & Eggs': [
    'milk', 'whole milk', 'skim milk', '2% milk', 'oat milk', 'almond milk', 'soy milk',
    'cream', 'half and half', 'half & half', 'heavy cream', 'whipping cream', 'sour cream',
    'butter', 'margarine', 'cheese', 'cheddar', 'mozzarella', 'parmesan', 'swiss', 'provolone',
    'brie', 'gouda', 'feta', 'cream cheese', 'cottage cheese', 'ricotta', 'goat cheese',
    'string cheese', 'shredded cheese', 'sliced cheese', 'american cheese',
    'yogurt', 'greek yogurt', 'egg', 'eggs', 'egg whites',
    'whipped cream', 'cool whip', 'coffee creamer', 'creamer'
  ],

  'Meat & Seafood': [
    'chicken', 'chicken breast', 'chicken thigh', 'chicken wing', 'chicken drumstick',
    'beef', 'ground beef', 'steak', 'roast', 'ribeye', 'sirloin', 'filet', 'brisket',
    'pork', 'pork chop', 'pork loin', 'pork tenderloin', 'ham', 'bacon', 'sausage',
    'turkey', 'ground turkey', 'turkey breast', 'lamb', 'lamb chop', 'veal',
    'salmon', 'tuna', 'shrimp', 'crab', 'lobster', 'cod', 'tilapia', 'halibut',
    'mahi mahi', 'swordfish', 'trout', 'catfish', 'scallop', 'scallops', 'clam', 'clams',
    'mussel', 'mussels', 'oyster', 'oysters', 'anchovy', 'anchovies', 'sardine', 'sardines',
    'hot dog', 'hot dogs', 'bratwurst', 'kielbasa', 'pepperoni', 'salami', 'prosciutto',
    'deli meat', 'lunch meat', 'cold cuts', 'meat', 'fish', 'seafood'
  ],

  'Bakery': [
    'bread', 'white bread', 'wheat bread', 'sourdough', 'rye bread', 'pumpernickel',
    'bagel', 'bagels', 'english muffin', 'english muffins', 'croissant', 'croissants',
    'muffin', 'muffins', 'roll', 'rolls', 'dinner roll', 'bun', 'buns', 'hamburger bun',
    'hot dog bun', 'pita', 'pita bread', 'naan', 'flatbread', 'tortilla', 'tortillas',
    'wrap', 'wraps', 'baguette', 'ciabatta', 'focaccia',
    'cake', 'cupcake', 'cupcakes', 'pie', 'donut', 'donuts', 'doughnut', 'doughnuts',
    'cookie', 'cookies', 'brownie', 'brownies', 'pastry', 'pastries', 'danish',
    'cinnamon roll', 'scone', 'scones', 'cornbread'
  ],

  'Frozen': [
    'frozen', 'ice cream', 'frozen pizza', 'frozen vegetable', 'frozen vegetables',
    'frozen fruit', 'frozen dinner', 'frozen meal', 'tv dinner', 'frozen chicken',
    'frozen fish', 'frozen shrimp', 'fish sticks', 'chicken nuggets', 'chicken tenders',
    'frozen fries', 'french fries', 'tater tots', 'frozen waffle', 'frozen waffles',
    'frozen pancake', 'frozen pancakes', 'frozen burrito', 'frozen burritos',
    'popsicle', 'popsicles', 'ice pop', 'gelato', 'sorbet', 'frozen yogurt',
    'ice cream sandwich', 'frozen pie', 'frozen bread', 'frozen dough',
    'hot pocket', 'hot pockets', 'lean cuisine', 'stouffers', 'digiorno',
    'eggo', 'totino', 'frozen corn', 'frozen peas', 'frozen broccoli'
  ],

  'Beverages': [
    'water', 'bottled water', 'sparkling water', 'seltzer', 'club soda', 'tonic water',
    'soda', 'pop', 'cola', 'coke', 'pepsi', 'sprite', 'mountain dew', 'dr pepper',
    'ginger ale', 'root beer', 'lemonade', 'iced tea', 'sweet tea',
    'juice', 'orange juice', 'apple juice', 'grape juice', 'cranberry juice',
    'tomato juice', 'vegetable juice', 'v8', 'smoothie',
    'coffee', 'ground coffee', 'coffee beans', 'k-cup', 'k cups', 'instant coffee',
    'tea', 'green tea', 'black tea', 'herbal tea', 'chamomile', 'tea bags',
    'energy drink', 'red bull', 'monster', 'gatorade', 'powerade', 'sports drink',
    'kombucha', 'coconut water', 'drink mix', 'kool-aid', 'lemon juice'
  ],

  'Snacks': [
    'chips', 'potato chips', 'tortilla chips', 'doritos', 'cheetos', 'fritos', 'lays',
    'pringles', 'popcorn', 'microwave popcorn', 'pretzel', 'pretzels',
    'cracker', 'crackers', 'goldfish', 'cheez-it', 'ritz', 'triscuit', 'wheat thin',
    'nut', 'nuts', 'almond', 'almonds', 'cashew', 'cashews', 'peanut', 'peanuts',
    'walnut', 'walnuts', 'pecan', 'pecans', 'pistachio', 'pistachios', 'mixed nuts',
    'trail mix', 'granola bar', 'granola bars', 'protein bar', 'energy bar',
    'candy', 'chocolate', 'gummy', 'gummies', 'gummy bear', 'skittles', 'starburst',
    'snickers', 'twix', 'kit kat', 'm&m', 'reese', 'hershey',
    'jerky', 'beef jerky', 'dried fruit', 'fruit snack', 'fruit snacks',
    'rice cake', 'rice cakes', 'cheese puff', 'veggie straw', 'veggie straws',
    'salsa', 'guacamole', 'hummus', 'dip', 'queso'
  ],

  'Canned & Jarred': [
    'canned', 'can of', 'canned tomato', 'canned tomatoes', 'diced tomatoes',
    'crushed tomatoes', 'tomato sauce', 'tomato paste', 'marinara', 'pasta sauce',
    'canned bean', 'canned beans', 'black beans', 'kidney beans', 'pinto beans',
    'chickpeas', 'garbanzo', 'lentils', 'refried beans', 'baked beans',
    'canned corn', 'canned peas', 'canned green beans', 'canned soup', 'soup',
    'broth', 'chicken broth', 'beef broth', 'vegetable broth', 'stock',
    'canned tuna', 'canned salmon', 'canned chicken', 'spam',
    'olive', 'olives', 'pickle', 'pickles', 'relish', 'sauerkraut',
    'jam', 'jelly', 'preserves', 'marmalade', 'peanut butter', 'almond butter',
    'nutella', 'honey', 'maple syrup', 'syrup', 'applesauce',
    'coconut milk', 'evaporated milk', 'condensed milk', 'canned fruit'
  ],

  'Pasta, Rice & Grains': [
    'pasta', 'spaghetti', 'penne', 'rigatoni', 'fusilli', 'farfalle', 'linguine',
    'fettuccine', 'angel hair', 'macaroni', 'elbow', 'lasagna', 'orzo', 'rotini',
    'noodle', 'noodles', 'egg noodle', 'ramen', 'udon', 'rice noodle', 'lo mein',
    'rice', 'white rice', 'brown rice', 'jasmine rice', 'basmati rice', 'wild rice',
    'instant rice', 'rice-a-roni', 'risotto',
    'quinoa', 'couscous', 'barley', 'farro', 'bulgur', 'oat', 'oats', 'oatmeal',
    'grits', 'polenta', 'cornmeal', 'flour', 'all-purpose flour', 'bread flour',
    'whole wheat flour', 'almond flour', 'cornstarch', 'breadcrumb', 'breadcrumbs',
    'panko', 'stuffing', 'mac and cheese', 'mac & cheese', 'hamburger helper',
    'cereal', 'granola', 'muesli'
  ],

  'Condiments & Spices': [
    'ketchup', 'mustard', 'mayonnaise', 'mayo', 'ranch', 'bbq sauce', 'barbecue sauce',
    'hot sauce', 'sriracha', 'tabasco', 'soy sauce', 'teriyaki', 'worcestershire',
    'vinegar', 'apple cider vinegar', 'balsamic', 'red wine vinegar', 'white vinegar',
    'olive oil', 'vegetable oil', 'canola oil', 'coconut oil', 'sesame oil', 'cooking spray',
    'salt', 'pepper', 'black pepper', 'sea salt', 'kosher salt',
    'garlic powder', 'onion powder', 'paprika', 'cumin', 'chili powder', 'cayenne',
    'cinnamon', 'nutmeg', 'oregano', 'italian seasoning', 'bay leaf', 'bay leaves',
    'turmeric', 'curry powder', 'garam masala', 'red pepper flakes', 'vanilla',
    'vanilla extract', 'baking soda', 'baking powder', 'yeast',
    'sugar', 'brown sugar', 'powdered sugar', 'stevia', 'splenda',
    'salad dressing', 'italian dressing', 'caesar dressing', 'thousand island',
    'steak sauce', 'fish sauce', 'hoisin', 'oyster sauce', 'tahini',
    'seasoning', 'spice', 'spices', 'extract', 'food coloring'
  ],

  'Deli': [
    'deli turkey', 'deli ham', 'deli chicken', 'deli roast beef', 'deli cheese',
    'rotisserie chicken', 'prepared meal', 'prepared food', 'sub', 'sandwich',
    'coleslaw', 'potato salad', 'macaroni salad', 'deviled eggs',
    'hummus tub', 'tzatziki', 'pimento cheese'
  ],

  'Breakfast': [
    'cereal', 'pancake mix', 'waffle mix', 'syrup', 'oatmeal', 'granola',
    'breakfast bar', 'pop tart', 'pop tarts', 'toaster strudel',
    'hash brown', 'hash browns', 'breakfast sausage', 'breakfast burrito'
  ],

  'Baking': [
    'flour', 'sugar', 'brown sugar', 'powdered sugar', 'baking soda', 'baking powder',
    'yeast', 'vanilla extract', 'cocoa powder', 'chocolate chips', 'baking chocolate',
    'cake mix', 'brownie mix', 'frosting', 'icing', 'food coloring',
    'pie crust', 'puff pastry', 'phyllo', 'shortening', 'lard',
    'sprinkles', 'cookie mix', 'muffin mix', 'biscuit mix'
  ],

  'Household': [
    'paper towel', 'paper towels', 'toilet paper', 'tissue', 'tissues', 'napkin', 'napkins',
    'trash bag', 'trash bags', 'garbage bag', 'garbage bags', 'zip lock', 'ziploc',
    'plastic wrap', 'saran wrap', 'aluminum foil', 'foil', 'parchment paper', 'wax paper',
    'dish soap', 'dishwasher detergent', 'dishwasher pods', 'cascade',
    'laundry detergent', 'fabric softener', 'dryer sheets', 'bleach', 'stain remover',
    'all-purpose cleaner', 'windex', 'lysol', 'clorox', 'cleaning wipes', 'disinfectant',
    'sponge', 'sponges', 'scrub brush', 'steel wool', 'broom', 'mop', 'dustpan',
    'vacuum bag', 'air freshener', 'candle', 'candles', 'light bulb', 'light bulbs',
    'battery', 'batteries', 'tape', 'glue', 'scissors'
  ],

  'Personal Care': [
    'shampoo', 'conditioner', 'body wash', 'soap', 'bar soap', 'hand soap',
    'toothpaste', 'toothbrush', 'mouthwash', 'dental floss', 'floss',
    'deodorant', 'antiperspirant', 'lotion', 'body lotion', 'hand lotion', 'moisturizer',
    'sunscreen', 'lip balm', 'chapstick', 'razor', 'razors', 'shaving cream',
    'cotton ball', 'cotton balls', 'cotton swab', 'q-tip', 'q-tips',
    'band-aid', 'bandage', 'first aid', 'medicine', 'tylenol', 'advil', 'ibuprofen',
    'vitamin', 'vitamins', 'supplement', 'supplements', 'melatonin', 'probiotic',
    'hair spray', 'gel', 'hair gel', 'hair tie', 'bobby pin',
    'feminine hygiene', 'tampon', 'tampons', 'pad', 'pads', 'panty liner',
    'contact solution', 'eye drops'
  ],

  'Baby & Kids': [
    'diaper', 'diapers', 'baby wipe', 'baby wipes', 'baby food', 'baby formula',
    'formula', 'sippy cup', 'pacifier', 'baby bottle', 'bib',
    'baby lotion', 'baby shampoo', 'baby powder', 'baby oil',
    'pull-ups', 'training pants', 'baby cereal', 'teething'
  ],

  'Pet': [
    'dog food', 'cat food', 'pet food', 'dog treat', 'cat treat', 'pet treat',
    'cat litter', 'kitty litter', 'dog bone', 'chew toy',
    'flea', 'tick', 'pet shampoo', 'bird seed', 'fish food'
  ],

  'Alcohol': [
    'beer', 'wine', 'red wine', 'white wine', 'rose', 'champagne', 'prosecco',
    'vodka', 'rum', 'tequila', 'whiskey', 'bourbon', 'gin', 'brandy', 'cognac',
    'scotch', 'liqueur', 'hard seltzer', 'white claw', 'truly',
    'mixer', 'tonic', 'margarita mix', 'bloody mary mix',
    'cider', 'hard cider', 'mead', 'sake', 'vermouth'
  ]
};

// Section display order (typical supermarket flow)
const SECTION_ORDER = [
  'Produce',
  'Bakery',
  'Deli',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Frozen',
  'Breakfast',
  'Pasta, Rice & Grains',
  'Canned & Jarred',
  'Baking',
  'Condiments & Spices',
  'Snacks',
  'Beverages',
  'Alcohol',
  'Household',
  'Personal Care',
  'Baby & Kids',
  'Pet',
  'Other'
];

// Section icons
const SECTION_ICONS = {
  'Produce': '🥬',
  'Bakery': '🍞',
  'Deli': '🥪',
  'Meat & Seafood': '🥩',
  'Dairy & Eggs': '🥛',
  'Frozen': '🧊',
  'Breakfast': '🥣',
  'Pasta, Rice & Grains': '🍝',
  'Canned & Jarred': '🥫',
  'Baking': '🧁',
  'Condiments & Spices': '🧂',
  'Snacks': '🍿',
  'Beverages': '☕',
  'Alcohol': '🍷',
  'Household': '🧹',
  'Personal Care': '🧴',
  'Baby & Kids': '👶',
  'Pet': '🐾',
  'Other': '📦'
};

/**
 * Categorize an item into a supermarket section.
 * Returns the best matching category or 'Other'.
 */
function categorizeItem(itemName) {
  const lower = itemName.toLowerCase().trim();

  // Try exact match first
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.includes(lower)) {
      return category;
    }
  }

  // Try partial match (item contains keyword or keyword contains item)
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lower.includes(keyword) || keyword.includes(lower)) {
        return category;
      }
    }
  }

  // Try word-level matching
  const words = lower.split(/\s+/);
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const word of words) {
      if (word.length > 2 && keywords.some(k => k.includes(word))) {
        return category;
      }
    }
  }

  return 'Other';
}

export { categorizeItem, SECTION_ORDER, SECTION_ICONS, CATEGORY_KEYWORDS };
