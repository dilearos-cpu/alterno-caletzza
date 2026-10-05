#!/usr/bin/env node
/**
 * Imprime el enlace de instalacion de COD Express (Dev/Prod) en caletzza.
 * Tras instalar, el callback en Render guarda el token offline y activa el descuento.
 */
const clientId = process.env.SHOPIFY_CLIENT_ID || "05c7b613f937a591fa1b70f3e591a891";
const appUrl = (process.env.APP_URL || "https://theme-caletzza-sh.onrender.com").replace(/\/$/, "");
const shop = "caletzza.myshopify.com";
console.log("1) Redesplegar Render con el server.js que incluye /auth/callback");
console.log("2) Abrir (logueado como staff de caletzza):");
console.log(`   https://admin.shopify.com/store/caletzza/oauth/install?client_id=${clientId}`);
console.log("   o");
console.log(`   ${appUrl}/auth/install?shop=${shop}`);
console.log("3) Verificar:");
console.log(`   ${appUrl}/discount-status?shop=${shop}`);
console.log(`   ${appUrl}/health`);
console.log("4) Si discount-status muestra rulesCount=0, abrir la tienda para que el tema sincronice reglas, o:");
console.log(`   curl -X POST ${appUrl}/sync-rules -H "Content-Type: application/json" -d '{"shop":"${shop}","rules":[...]}'`);
console.log("5) En tiendas no-Plus, checkoutMode será draft_invoice (borrador con descuento).");
