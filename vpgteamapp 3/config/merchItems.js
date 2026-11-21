// VPG team merch - designs Sylvester has saved on CustomInk. Each item
// links out to its own public CustomInk "share" page (no CustomInk login
// required to view or buy) where anyone can hit "Buy Now" to order their
// own size, or "Buy With a Group" to collect sizes across the team and
// split payment - CustomInk handles the actual order, payment, and
// shipping from there; this app is just the catalog/launch point.
//
// To add, remove, or reorder items: on CustomInk, open the design and use
// "Retrieve another design" / the design's own share link to get its
// shareUrl, then add an entry here (imageUrl is optional - the item still
// renders fine without one).
//
// Items without a shareUrl show a "Coming soon" tag instead of the order
// button - use that for designs that are previewed (mockup image in
// public/images/merch) but not saved on CustomInk yet.
const MERCH_ITEMS = [
  {
    name: "Venture 216 Hoodie",
    product: "Comfort Colors Hooded Sweatshirt",
    color: "Grey",
    imageUrl: "/images/merch/venture-216-hoodie-grey.jpg",
    shareUrl: "https://www.customink.com/designs/VPG%20Venture%20216%20Hoodie/mnr0-00d4-chye/share",
  },
  {
    name: "Venture 216 Hoodie",
    product: "Comfort Colors Hooded Sweatshirt",
    color: "White",
    imageUrl: "/images/merch/venture-216-hoodie-white.jpg",
    shareUrl: "https://www.customink.com/designs/VPG%20Venture%20216%20Hoodie/mnr0-00d4-chye/share",
  },
  {
    name: "Venture 216 Nike Tee",
    product: "Nike Team rLegend Recycled Performance Shirt",
    color: "Carbon Heather (Gray)",
    imageUrl: "/images/merch/venture-216-tee-gray.jpg",
    shareUrl: "https://www.customink.com/designs/VPG%20Venture%20216%20Nike%20Tee/mnr0-00d4-crmq/share",
  },
  {
    name: "Venture 216 Nike Tee",
    product: "Nike Team rLegend Recycled Performance Shirt",
    color: "White",
    imageUrl: "/images/merch/venture-216-tee-white.jpg",
    shareUrl: "https://www.customink.com/designs/VPG%20Venture%20216%20Nike%20Tee/mnr0-00d4-crmq/share",
  },
  {
    name: "VPG Nike Vapor Polo",
    product: "Nike Dri-FIT Vapor Performance Polo - Embroidered",
    color: "White",
    imageUrl: "/images/merch/vpg-nike-vapor-polo-white.jpg",
    shareUrl: "https://www.customink.com/designs/VPG%20Nike%20Vapor%20Polo%20White/mnr0-00d4-crsb/share",
  },
  {
    name: "VPG Vineyard Vines Dress Shirt",
    product: "Vineyard Vines On-The-Go Gingham Stretch Performance Dress Shirt",
    color: "Maritime Blue",
    imageUrl: "/images/merch/vpg-vineyard-vines-dress-shirt.jpg",
    shareUrl: "https://www.customink.com/designs/VPG%20Vineyard%20Vines%20Dress/mnr0-00d4-crtb/share",
  },
  {
    name: "VPG Backpack",
    product: 'Nike Utility Speed 16" Computer Backpack 2.0',
    color: "Black",
    imageUrl:
      "https://mms-images.out.customink.com/mms/images/catalog/colors/1625400/views/alt/front_medium_extended.png?design=mnr0-00d3-7mau&pblegacy=1&pblegacysize=small&pblegacywm=1",
    shareUrl: "https://www.customink.com/designs/VPG%20backpack/mnr0-00d3-7mau/share",
  },
  {
    name: "VPG Nike Heritage Hat",
    product: "Nike Heritage 86 Cap - Embroidered (VPG patch logo)",
    color: "White",
    imageUrl: "/images/merch/vpg-nike-heritage-hat-patch.jpg",
  },
  {
    name: "VPG Carhartt Beanie",
    product: "Carhartt Watch Beanie 2.0 - Embroidered",
    color: "Coal Heather",
    imageUrl: "/images/merch/vpg-carhartt-beanie-coal.jpg",
    shareUrl: "https://www.customink.com/designs/VPG%20Carhartt%20Beanie%20Black/mnr0-00d4-csne/share",
  },
  {
    name: "VPG Carhartt Beanie",
    product: "Carhartt Watch Beanie 2.0 - Embroidered",
    color: "Black / White",
    imageUrl: "/images/merch/vpg-carhartt-beanie-blackwhite.jpg",
    shareUrl: "https://www.customink.com/designs/VPG%20Carhartt%20Beanie%20Black/mnr0-00d4-csne/share",
  },
  {
    name: "VPG Nike Commute Backpack",
    product: 'Nike Commute 15" Computer Backpack',
    color: "Desert Khaki",
    imageUrl: "/images/merch/vpg-nike-commute-backpack-khaki.jpg",
  },
  {
    name: "VPG Nike Commute Backpack",
    product: 'Nike Commute 15" Computer Backpack',
    color: "Black",
    imageUrl: "/images/merch/vpg-nike-commute-backpack-black.jpg",
  },
  {
    name: "VPG Stanley Camp Mug",
    product: 'Stanley 12 oz. Legendary Camp Mug',
    color: "Cream",
    imageUrl: "/images/merch/vpg-stanley-mug-cream.jpg",
  },
  {
    name: "VPG Stanley Camp Mug",
    product: 'Stanley 12 oz. Legendary Camp Mug',
    color: "Green",
    imageUrl: "/images/merch/vpg-stanley-mug-green.jpg",
  },
  {
    name: "VPG Stanley Camp Mug",
    product: 'Stanley 12 oz. Legendary Camp Mug',
    color: "Navy",
    imageUrl: "/images/merch/vpg-stanley-mug-navy.jpg",
  },
  {
    name: "VPG Travel Bottle",
    product: 'Insulated Stainless Steel Travel Bottle',
    color: "White",
    imageUrl: "/images/merch/vpg-travel-bottle-white.jpg",
  },
  {
    name: "VPG Travel Bottle",
    product: 'Insulated Stainless Steel Travel Bottle',
    color: "Navy",
    imageUrl: "/images/merch/vpg-travel-bottle-navy.jpg",
  },
  {
    name: "VPG Travel Bottle",
    product: 'Insulated Stainless Steel Travel Bottle',
    color: "Green",
    imageUrl: "/images/merch/vpg-travel-bottle-green.jpg",
  },
  {
    name: "VPG House Magnet",
    product: 'Full Color House Refrigerator Magnet',
    color: "Navy",
    imageUrl: "/images/merch/vpg-house-magnet.jpg",
  },
];

module.exports = { MERCH_ITEMS };
