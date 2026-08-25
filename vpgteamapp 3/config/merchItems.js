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
const MERCH_ITEMS = [
  {
    name: "VPG Backpack",
    product: 'Nike Utility Speed 16" Computer Backpack 2.0',
    color: "Black",
    imageUrl:
      "https://mms-images.out.customink.com/mms/images/catalog/colors/1625400/views/alt/front_medium_extended.png?design=mnr0-00d3-7mau&pblegacy=1&pblegacysize=small&pblegacywm=1",
    shareUrl: "https://www.customink.com/designs/VPG%20backpack/mnr0-00d3-7mau/share",
  },
  {
    name: "VPG Hoodie",
    product: "Nike Club Fleece Sleeve Swoosh Pullover Hoodie",
    color: "Gorge Green",
    imageUrl:
      "https://mms-images.out.customink.com/mms/images/catalog/colors/1102607/views/alt/front_medium_extended.png?design=mnr0-00d3-7knr&pblegacy=1&pblegacysize=small&pblegacywm=1",
    shareUrl: "https://www.customink.com/designs/VPG%20hoodies/mnr0-00d3-7knr/share",
  },
  {
    name: "VPG Performance Polo",
    product: "Nike Dri-FIT Tech Sport Performance Polo",
    color: "Navy",
    imageUrl:
      "https://mms-images.out.customink.com/mms/images/catalog/colors/1536402/views/alt/front_medium_extended.png?design=mnr0-00d3-6mg9&pblegacy=1&pblegacysize=small&pblegacywm=1",
    shareUrl: "https://www.customink.com/designs/Sylvester%20%20Hagan/mnr0-00d3-6mg9/share",
  },
  {
    name: "VPG Hat",
    product: "Nike Dri-FIT Swoosh Perforated Hat - Embroidered",
    color: "White / Black",
    imageUrl:
      "https://mms-images.out.customink.com/mms/images/catalog/colors/481600/views/alt/front_medium_extended.png?design=mnr0-00d3-7m61&pblegacy=1&pblegacysize=small&pblegacywm=1",
    shareUrl: "https://www.customink.com/designs/VPG%20hat%201/mnr0-00d3-7m61/share",
  },
];

module.exports = { MERCH_ITEMS };
