/**
 * Sincroniza reglas de descuento al descuento automatico ($app) sin levantar Express.
 * Uso: node scripts/sync-rules-now.mjs
 */
import dotenv from "dotenv";

dotenv.config();

const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || "tienda-dev-cuunda.myshopify.com";
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN || process.env.ADMIN_TOKEN || "";
const API_VERSION = process.env.SHOPIFY_API_VERSION || "2024-10";
const FUNCTION_ID = process.env.DISCOUNT_FUNCTION_ID || "019f7045-a3c1-7462-b5c9-eaee68da1edc";
const DISCOUNT_TITLE =
  process.env.AUTOMATIC_DISCOUNT_TITLE || "Descuento por cantidad Caletzza Dev";

const RULES = [
  {
    id: "rule_bodys",
    title: "Bodys",
    enabled: true,
    scope: "both",
    priority: 20,
    exclusive: false,
    count_mode: "filter_set",
    filter: {
      type: "collection",
      collection: "bodys",
      collections: ["bodys"],
      collection_id: "gid://shopify/Collection/487748993282",
      collection_ids: ["gid://shopify/Collection/487748993282"],
      title_prefixes: ["BODY", "Body", "body"]
    },
    ranges: [
      { min: 1, max: 3, type: "fixed_price_per_item", value: 3500000 },
      { min: 4, max: 6, type: "fixed_price_per_item", value: 3000000 },
      { min: 7, max: 12, type: "fixed_price_per_item", value: 2500000 }
    ],
    conditions: []
  },
  {
    id: "rule_basicas",
    title: "Básicas",
    enabled: true,
    scope: "both",
    priority: 10,
    exclusive: false,
    count_mode: "filter_set",
    filter: {
      type: "collection",
      collection: "basicas",
      collections: ["basicas"],
      collection_id: "gid://shopify/Collection/487733985538",
      collection_ids: ["gid://shopify/Collection/487733985538"],
      title_prefixes: ["Camiseta", "camiseta", "CAMISETA"]
    },
    ranges: [
      { min: 1, max: 3, type: "fixed_price_per_item", value: 2000000 },
      { min: 4, max: 6, type: "fixed_price_per_item", value: 1800000 },
      { min: 7, max: 12, type: "fixed_price_per_item", value: 1500000 }
    ],
    conditions: []
  }
];

async function gql(query, variables = {}) {
  const response = await fetch(`https://${SHOP_DOMAIN}/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ADMIN_TOKEN
    },
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors[0].message);
  }
  return payload.data;
}

async function findOrCreateDiscount() {
  const data = await gql(`{
    discountNodes(first: 50, query: "method:automatic") {
      nodes {
        id
        discount {
          __typename
          ... on DiscountAutomaticApp {
            title status discountId
            appDiscountType { functionId }
          }
        }
      }
    }
  }`);

  const nodes = (data.discountNodes?.nodes || []).filter(
    (node) => node.discount?.__typename === "DiscountAutomaticApp"
  );
  const existing =
    nodes.find((node) => node.discount?.appDiscountType?.functionId === FUNCTION_ID) ||
    nodes.find((node) => String(node.discount?.title || "").includes("Caletzza")) ||
    nodes[0];

  if (existing?.discount?.status === "ACTIVE") {
    return existing;
  }

  if (existing?.id) {
    return existing;
  }

  const created = await gql(
    `mutation discountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
      discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
        automaticAppDiscount { discountId title status }
        userErrors { message }
      }
    }`,
    {
      automaticAppDiscount: {
        title: DISCOUNT_TITLE,
        functionId: FUNCTION_ID,
        startsAt: new Date().toISOString(),
        combinesWith: {
          orderDiscounts: true,
          productDiscounts: false,
          shippingDiscounts: true
        },
        discountClasses: ["PRODUCT"]
      }
    }
  );

  if (created.discountAutomaticAppCreate.userErrors?.length) {
    throw new Error(created.discountAutomaticAppCreate.userErrors.map((e) => e.message).join(" "));
  }

  return {
    id: created.discountAutomaticAppCreate.automaticAppDiscount.discountId,
    discount: created.discountAutomaticAppCreate.automaticAppDiscount
  };
}

async function setMetafields(ownerId) {
  const collectionIds = [
    "gid://shopify/Collection/487748993282",
    "gid://shopify/Collection/487733985538"
  ];
  const result = await gql(
    `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { namespace key }
        userErrors { message }
      }
    }`,
    {
      metafields: [
        {
          ownerId,
          namespace: "$app",
          key: "discount_rules",
          type: "json",
          value: JSON.stringify(RULES)
        },
        {
          ownerId,
          namespace: "$app",
          key: "function_input",
          type: "json",
          value: JSON.stringify({ collectionIds })
        },
        {
          ownerId,
          namespace: "caletzza",
          key: "discount_rules",
          type: "json",
          value: JSON.stringify(RULES)
        }
      ]
    }
  );

  if (result.metafieldsSet.userErrors?.length) {
    throw new Error(result.metafieldsSet.userErrors.map((e) => e.message).join(" "));
  }
}

async function main() {
  if (!ADMIN_TOKEN) {
    throw new Error("Falta ADMIN_TOKEN / SHOPIFY_ADMIN_API_TOKEN");
  }
  const discount = await findOrCreateDiscount();
  console.log("Discount:", discount.id, discount.discount?.status || discount.discount?.title);
  await setMetafields(discount.id);
  console.log("Metafields $app.discount_rules + $app.function_input OK");
  console.log("Rules:", RULES.length, "collections: bodys + basicas");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
