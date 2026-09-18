// Product catalog.
// Each product: id (unique, stable), number (item # on the flyer), category, name, description, price,
// image (optional path or URL). Products without an image show a category icon in place of the thumbnail.
// Descriptions are from the 2026 wreath flyer. Thumbnails are cut from the flyer scans by tools/crop_flyer.py.
// Popcorn flavors and descriptions are from the Pack 118 order form. Logos come from Pop's Kettle Corn
// (tools/fetch_popcorn_logos.py); Lemon Bar isn't on their site, so it shows the category icon.
export const PRODUCTS = [
  { id: 'w1', number: 1, category: 'Wreaths', name: '20" Wreath', price: 28, image: 'img/w1.jpg',
    description: 'Velvet bow, natural cones, fresh evergreen. A fragrant beauty. Nice door size. Full and beautiful.' },
  { id: 'w2', number: 2, category: 'Wreaths', name: '26" Wreath', price: 32, image: 'img/w2.jpg',
    description: 'Velvet bow, natural cones, fresh evergreen. Great size for a door. Larger and fuller than the 20".' },
  { id: 'w3', number: 3, category: 'Wreaths', name: '36" Wreath', price: 41, image: 'img/w3.jpg',
    description: 'Velvet bow, natural cones, fresh evergreen. Very popular. Great as an indoor or outdoor decoration. 3 feet high. Beautiful large bow now on the 36".' },
  { id: 'w4', number: 4, category: 'Wreaths', name: '48" Wreath', price: 58, image: 'img/w4.jpg',
    description: 'Large red bow, large natural frosted cones. 4 feet high. Full, fragrant fresh evergreen. Sure to make an impact for the holidays.' },
  { id: 'w5', number: 5, category: 'Wreaths', name: '60" Wreath', price: 69, image: 'img/w5.jpg',
    description: '5 feet high. A real holiday beauty. Large red velvet bow, fresh fragrant evergreen, adorned with large cones.' },
  { id: 'w6', number: 6, category: 'Wreaths', name: '72" Wreath', price: 81, image: 'img/w6.jpg',
    description: 'Great for dramatic effect. 6 feet high. Fragrant, full fresh evergreen with a velvet bow and many frosted cones.' },
  { id: 'w7', number: 7, category: 'Wreaths', name: 'Double 36" Wreath', price: 60, image: 'img/w7.jpg',
    description: 'Large velvet bow, natural cones. Decoration and fresh evergreen on both sides. 3 feet high. Perfect where both sides are seen.' },
  { id: 'w8', number: 8, category: 'Wreaths', name: 'Double 48" Wreath', price: 71, image: 'img/w8.jpg',
    description: 'Large velvet bow, natural cones. Decoration and evergreen on both sides. 4 feet tall. Perfect for a large window seen from both sides.' },
  { id: 'w9', number: 9, category: 'Wreaths', name: 'Cane', price: 35, image: 'img/w9.jpg',
    description: '36" from tip to tip. Red velvet bow and fresh evergreen. Very full and fragrant. A sure pleaser.' },
  { id: 'w10', number: 10, category: 'Wreaths', name: 'Swag', price: 25, image: 'img/w10.jpg',
    description: 'Red velvet bow and evergreen to bring color and fragrance to the holidays. Very full. Approx. 30".' },
  { id: 'w11', number: 11, category: 'Wreaths', name: "25' Roping", price: 49, image: 'img/w11.jpg',
    description: '25-foot fresh, full garland with a wire-wrapped flex core. Beautiful around doors, windows, mantels and stair rails.' },
  { id: 'w15', number: 15, category: 'Wreaths', name: '30" Easel', price: 8.5, image: 'img/w15.jpg',
    description: 'Displays a 20"–26" wreath, cane or swag. For display and cemetery use. Wreath not included.' },
  { id: 'w16', number: 16, category: 'Wreaths', name: '15" Door Hanger', price: 7.5, image: 'img/w16.jpg',
    description: 'White metal. No more nails in your door. Use it year after year.' },
  { id: 'w20', number: 20, category: 'Wreaths', name: '36" Cross', price: 46, image: 'img/w20.jpg',
    description: 'A beautiful full cross handcrafted with fresh evergreen. Great as a memorial, door hanging or church accent.' },
  { id: 'w21', number: 21, category: 'Wreaths', name: 'Boxed 24" Extra Special Wreath', price: 46, image: 'img/w21.jpg',
    description: 'Boxed and delivered with your regular order. Fragrant balsam, cedar, and white and red pine. Gold accents behind the bow. Very full.' },
  { id: 'w22', number: 22, category: 'Wreaths', name: 'Boxed 24" Platinum Wreath', price: 50, image: 'img/w22.jpg',
    description: 'Boxed and delivered with your regular order. Our biggest bow: gold organza ribbon over red velvet, with frosted pine cones and gold ornaments.' },

  { id: 'p1', number: 1, category: 'Popcorn', name: 'Ope Mix', price: 9, image: 'img/p1.jpg',
    description: 'A blend of our Original Kettle Corn, Caramel Kettle and Coconut Oil & Sea Salt.' },
  { id: 'p2', number: 2, category: 'Popcorn', name: 'Original Kettle Corn', price: 9, image: 'img/p2.jpg',
    description: "Pop's OG recipe. Sweet and salty perfection since 2009." },
  { id: 'p3', number: 3, category: 'Popcorn', name: 'Caramel Kettle', price: 9, image: 'img/p3.jpg',
    description: 'Crunchy, caramel-ly, salty. What more could you ask for in a sweet corn?' },
  { id: 'p4', number: 4, category: 'Popcorn', name: 'Lemon Bar', price: 9, image: '',
    description: 'The perfect mix of lemon sweetness on white popcorn that everyone will love.' },
  { id: 'p5', number: 5, category: 'Popcorn', name: 'Birthday Cake', price: 9, image: 'img/p5.jpg',
    description: "It's kettle corn, but with a phenomenal vanilla fun-fetti flavor." },
  { id: 'p6', number: 6, category: 'Popcorn', name: 'Party Mix', price: 9, image: 'img/p6.jpg',
    description: 'A blend of OG Kettle, Caramel and Chocolate Kettle Corn. A party in your mouth.' },
  { id: 'p7', number: 7, category: 'Popcorn', name: 'Muskego Mix', price: 9, image: 'img/p7.jpg',
    description: 'OG Kettle, Caramel and Cheddar: our three most popular flavors.' },
  { id: 'p8', number: 8, category: 'Popcorn', name: 'Yellow Cheddar', price: 9, image: 'img/p8.jpg',
    description: 'Yellow cheddar popcorn from Wisconsin. A staple and a must-have.' },
  { id: 'p9', number: 9, category: 'Popcorn', name: 'White Cheddar', price: 9, image: 'img/p9.jpg',
    description: "Creamy and light. White cheddar won't leave your fingers orange." },
  { id: 'p10', number: 10, category: 'Popcorn', name: 'Jalapeño Cheddar', price: 9, image: 'img/p10.jpg',
    description: 'Just enough spice to make it dangerous.' },
  { id: 'p11', number: 11, category: 'Popcorn', name: 'Coconut Oil & Sea Salt (COSS)', price: 9, image: 'img/p11.jpg',
    description: "Like buttered popcorn, but so much better, and healthier." },
];

// Shown in place of a thumbnail when a product has no image.
export const CATEGORY_ICONS = { Wreaths: '🎄', Popcorn: '🍿' };

// Shown under the category heading.
export const CATEGORY_NOTES = { Popcorn: 'All bags are 7 cups. $9 each or 3 for $25, mix and match.' };

// Bundle pricing: every `bundleSize` items in the category cost `bundlePrice` together.
export const PRICING_RULES = [
  { category: 'Popcorn', bundleSize: 3, bundlePrice: 25, label: 'Popcorn 3 for $25' },
];

// Each Scout's sales goal for the season. Counts everything collected, donations included.
export const SALES_GOAL = 400;
