// Curated, static list of well-known market-leading companies per industry —
// powers the "Exclude big players" suggestion chips on the Discovery form.
// Deliberately NOT a database table: this list is small, shared, and rarely
// changes, so a hand-maintained file avoids a schema migration entirely.
// Add to it any time a run keeps surfacing an obvious household name that
// isn't listed here yet.

export interface KnownCompany {
  name: string;
  domain: string;
}

export const KNOWN_COMPANIES: Record<string, KnownCompany[]> = {
  "SaaS": [
    { name: "Salesforce", domain: "salesforce.com" },
    { name: "HubSpot", domain: "hubspot.com" },
    { name: "Slack", domain: "slack.com" },
    { name: "Zoom", domain: "zoom.us" },
    { name: "Workday", domain: "workday.com" },
    { name: "ServiceNow", domain: "servicenow.com" },
    { name: "Atlassian", domain: "atlassian.com" },
    { name: "Adobe", domain: "adobe.com" },
  ],
  "E-commerce": [
    { name: "Amazon", domain: "amazon.com" },
    { name: "Walmart", domain: "walmart.com" },
    { name: "eBay", domain: "ebay.com" },
    { name: "Shopify", domain: "shopify.com" },
    { name: "Target", domain: "target.com" },
    { name: "Etsy", domain: "etsy.com" },
    { name: "Wayfair", domain: "wayfair.com" },
    { name: "Alibaba", domain: "alibaba.com" },
  ],
  "Fintech": [
    { name: "PayPal", domain: "paypal.com" },
    { name: "Stripe", domain: "stripe.com" },
    { name: "Block (Square)", domain: "squareup.com" },
    { name: "Visa", domain: "visa.com" },
    { name: "Mastercard", domain: "mastercard.com" },
    { name: "Coinbase", domain: "coinbase.com" },
    { name: "Robinhood", domain: "robinhood.com" },
    { name: "Intuit", domain: "intuit.com" },
  ],
  "Healthcare": [
    { name: "UnitedHealth Group", domain: "unitedhealthgroup.com" },
    { name: "CVS Health", domain: "cvshealth.com" },
    { name: "Pfizer", domain: "pfizer.com" },
    { name: "Johnson & Johnson", domain: "jnj.com" },
    { name: "Cigna", domain: "cigna.com" },
    { name: "Elevance Health", domain: "elevancehealth.com" },
    { name: "Teladoc", domain: "teladochealth.com" },
    { name: "GE Healthcare", domain: "gehealthcare.com" },
  ],
  "Marketing": [
    { name: "HubSpot", domain: "hubspot.com" },
    { name: "Mailchimp", domain: "mailchimp.com" },
    { name: "Adobe", domain: "adobe.com" },
    { name: "Salesforce Marketing Cloud", domain: "salesforce.com" },
    { name: "Marketo", domain: "marketo.com" },
    { name: "Constant Contact", domain: "constantcontact.com" },
    { name: "Hootsuite", domain: "hootsuite.com" },
    { name: "Semrush", domain: "semrush.com" },
  ],
  "Real Estate": [
    { name: "Zillow", domain: "zillow.com" },
    { name: "Redfin", domain: "redfin.com" },
    { name: "CBRE", domain: "cbre.com" },
    { name: "Compass", domain: "compass.com" },
    { name: "RE/MAX", domain: "remax.com" },
    { name: "Realtor.com", domain: "realtor.com" },
    { name: "JLL", domain: "jll.com" },
    { name: "Opendoor", domain: "opendoor.com" },
  ],
  "Manufacturing": [
    { name: "General Electric", domain: "ge.com" },
    { name: "3M", domain: "3m.com" },
    { name: "Honeywell", domain: "honeywell.com" },
    { name: "Caterpillar", domain: "caterpillar.com" },
    { name: "Boeing", domain: "boeing.com" },
    { name: "Siemens", domain: "siemens.com" },
    { name: "Emerson", domain: "emerson.com" },
    { name: "Illinois Tool Works", domain: "itw.com" },
  ],
  "Retail": [
    { name: "Walmart", domain: "walmart.com" },
    { name: "Target", domain: "target.com" },
    { name: "Costco", domain: "costco.com" },
    { name: "Home Depot", domain: "homedepot.com" },
    { name: "Best Buy", domain: "bestbuy.com" },
    { name: "Kroger", domain: "kroger.com" },
    { name: "Lowe's", domain: "lowes.com" },
    { name: "Macy's", domain: "macys.com" },
  ],
  "Consumer brands": [
    { name: "Procter & Gamble", domain: "pg.com" },
    { name: "Unilever", domain: "unilever.com" },
    { name: "Nike", domain: "nike.com" },
    { name: "Coca-Cola", domain: "coca-cola.com" },
    { name: "PepsiCo", domain: "pepsico.com" },
    { name: "Nestle", domain: "nestle.com" },
    { name: "Colgate-Palmolive", domain: "colgatepalmolive.com" },
    { name: "L'Oreal", domain: "loreal.com" },
  ],
  "Logistics": [
    { name: "FedEx", domain: "fedex.com" },
    { name: "UPS", domain: "ups.com" },
    { name: "DHL", domain: "dhl.com" },
    { name: "XPO Logistics", domain: "xpo.com" },
    { name: "C.H. Robinson", domain: "chrobinson.com" },
    { name: "J.B. Hunt", domain: "jbhunt.com" },
    { name: "Maersk", domain: "maersk.com" },
    { name: "Ryder", domain: "ryder.com" },
  ],
  "EdTech": [
    { name: "Coursera", domain: "coursera.org" },
    { name: "Udemy", domain: "udemy.com" },
    { name: "Khan Academy", domain: "khanacademy.org" },
    { name: "Duolingo", domain: "duolingo.com" },
    { name: "Chegg", domain: "chegg.com" },
    { name: "2U", domain: "2u.com" },
    { name: "Pearson", domain: "pearson.com" },
    { name: "Blackboard", domain: "blackboard.com" },
  ],
  "Cybersecurity": [
    { name: "CrowdStrike", domain: "crowdstrike.com" },
    { name: "Palo Alto Networks", domain: "paloaltonetworks.com" },
    { name: "Fortinet", domain: "fortinet.com" },
    { name: "Cisco", domain: "cisco.com" },
    { name: "Okta", domain: "okta.com" },
    { name: "Zscaler", domain: "zscaler.com" },
    { name: "Check Point", domain: "checkpoint.com" },
    { name: "Rapid7", domain: "rapid7.com" },
  ],
};
