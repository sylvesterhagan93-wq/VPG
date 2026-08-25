// Saved title/escrow companies for the "Escrow / Title Company" section on
// Purchase, Novation, and Assignment agreements. This just powers a
// "Saved Company" convenience dropdown on the form (views/agreement-form.ejs)
// that auto-fills the fields below it - the fields themselves stay plain
// text and fully editable, since a one-off/new title company can show up on
// any deal. To add another saved company, add an entry here with whatever
// fields you have (any of them can be left blank).
const TITLE_COMPANIES = [
  {
    name: "American Title Solutions",
    contactName: "Stephen Carter, Escrow Officer",
    phone: "330-835-4430 (O) / 330-835-4432 (F) / 330-842-6960 (T)",
    email: "stephen@americantitlesolutions.com",
    address: "275 Springside Dr. Suite 100, Akron, OH 44333",
  },
  {
    name: "Hometown Title Agency",
    contactName: "",
    phone: "513-936-9300 (P) / 513-936-9322 (F)",
    email: "processor@htatitle.com",
    address: "4680 Parkway Dr, Ste 100 B, Mason, OH 45040",
  },
  {
    name: "Innovative Title",
    contactName: "Lisa Redden, Escrow Officer",
    phone: "216-635-0870 (P) / 216-635-0874 (F)",
    email: "lisa@innovativetitle.net",
    address: "1440 Rockside Rd., Ste 310, Parma, OH 44134",
  },
  {
    name: "Superior Title",
    contactName: "Scott Fazekas, Director of Title Operations/Licensed Agent",
    phone: "614-326-1900 (O) / 740-361-1556 (C) / 614-326-0677 (F)",
    email: "scott@superiortitle.org",
    address: "1383 Dublin Rd. Columbus, OH 43215",
  },
  {
    name: "Pioneer Title Agency",
    contactName: "Dina Shroth, Senior Escrow Officer",
    phone: "480-368-1500 (O) / 866-910-8015 (Toll Free)",
    email: "Dina.Shroth@ptaaz.com",
    address: "14850 N Scottsdale Rd. Ste 160, Scottsdale, AZ 85254",
  },
  {
    name: "CLOSED Title National",
    contactName: "Nancy Fitzgibbons, Escrow Officer",
    phone: "941-867-7680",
    email: "nancy@closedtitle.com",
    address: "",
  },
];

module.exports = { TITLE_COMPANIES };
