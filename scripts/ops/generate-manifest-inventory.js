/**
 * scripts/ops/generate-manifest-inventory.js
 *
 * Deterministic Machine-Readable Inventory Generator & Validator for Phase 10 UAT Fixtures.
 *
 * Requirements:
 * - Generates deterministic inventory directly from scripts/ops/manifests/uat-fixture-manifest.json
 * - Emits scripts/ops/manifests/uat-fixture-inventory.json
 * - Audits and reconciles:
 *   - category ObjectId vs FulfillmentLocation ObjectId
 *   - product slugs and SKUs
 *   - seeded persona emails and roles
 *   - order ObjectIds and public orderId values
 * - Validates consistency across evidence harness and evidence documentation.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '..', '..');
const manifestPath = path.resolve(repoRoot, 'scripts/ops/manifests/uat-fixture-manifest.json');
const inventoryPath = path.resolve(repoRoot, 'scripts/ops/manifests/uat-fixture-inventory.json');
const harnessPath = path.resolve(repoRoot, 'frontend/tests/phase10StorefrontEvidence.mts');
const docPath = path.resolve(repoRoot, 'docs/execution/evidence/PHASE_10_STOREFRONT_MANUAL_QA_EVIDENCE.md');

function generateInventory() {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Authoritative manifest not found at: ${manifestPath}`);
  }

  const raw = fs.readFileSync(manifestPath, 'utf8');
  const manifest = JSON.parse(raw);

  const inventory = {
    fixtureNamespace: manifest.fixtureNamespace,
    specificationVersion: manifest.specificationVersion,
    description: manifest.description,
    dependencyOrder: manifest.dependencyOrder,
    cleanupOrder: manifest.cleanupOrder,
    collectionNames: Object.keys(manifest.datasets),
    recordCounts: Object.fromEntries(
      Object.entries(manifest.datasets).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
    ),
    allDeterministicIds: [],
    fulfillmentLocations: (manifest.datasets.fulfillmentlocations || []).map((fl) => ({
      _id: fl._id,
      locationCode: fl.locationCode,
      displayName: fl.displayName,
      countryCode: fl.countryCode,
      subdivision: fl.subdivision,
      city: fl.city,
      postalCode: fl.postalCode,
      identityFields: fl.identityFields,
    })),
    categories: (manifest.datasets.categories || []).map((cat) => ({
      _id: cat._id,
      name: cat.name,
      slug: cat.slug,
      isActive: cat.isActive,
      isFeatured: cat.isFeatured,
      identityFields: cat.identityFields,
    })),
    users: (manifest.datasets.users || []).map((u) => ({
      _id: u._id,
      email: u.email,
      role: u.role,
      fullName: u.fullName,
      residenceCountry: u.residenceCountry,
      identityFields: u.identityFields,
    })),
    transientGuestPersona: manifest.transientPayloads?.guestCheckoutPersona
      ? {
          email: manifest.transientPayloads.guestCheckoutPersona.email,
          fullName: manifest.transientPayloads.guestCheckoutPersona.shippingAddress?.fullName,
          note: manifest.transientPayloads.guestCheckoutPersona.note,
        }
      : null,
    products: (manifest.datasets.products || []).map((p) => ({
      _id: p._id,
      name: p.name,
      slug: p.slug,
      sku: p.sku,
      category: p.category,
      price: p.price,
      stock: p.stock,
      allowCOD: p.allowCOD,
      status: p.status,
      identityFields: p.identityFields,
    })),
    orders: (manifest.datasets.orders || []).map((o) => ({
      _id: o._id,
      orderId: o.orderId,
      user: o.user,
      orderStatus: o.orderStatus,
      paymentMethod: o.paymentMethod,
      totalAmount: o.totalAmount,
      currency: o.currency,
      identityFields: o.identityFields,
    })),
    coupons: (manifest.datasets.coupons || []).map((c) => ({
      _id: c._id,
      code: c.code,
      type: c.type,
      value: c.value,
      identityFields: c.identityFields,
    })),
    inventoryPositions: (manifest.datasets.inventorypositions || []).map((ip) => ({
      _id: ip._id,
      locationCode: ip.locationCode,
      canonicalSku: ip.canonicalSku,
      onHand: ip.onHand,
      identityFields: ip.identityFields,
    })),
  };

  const allIds = new Set();
  for (const records of Object.values(manifest.datasets)) {
    if (Array.isArray(records)) {
      for (const r of records) {
        if (r._id) allIds.add(r._id);
      }
    }
  }
  inventory.allDeterministicIds = Array.from(allIds).sort();

  return inventory;
}

function validateManifestFacts(inventory) {
  const errors = [];

  // 1. Verify FulfillmentLocation vs Category disambiguation
  const fl = inventory.fulfillmentLocations.find((l) => l._id === '66f000000000000000000001');
  if (!fl || fl.locationCode !== 'KHI-WH-01') {
    errors.push('Fulfillment location 66f000000000000000000001 must have locationCode KHI-WH-01');
  }

  const cat = inventory.categories.find((c) => c._id === '66f000000000000000000002');
  if (!cat || cat.slug !== 'dry-fruits-nuts') {
    errors.push('Category 66f000000000000000000002 must have slug dry-fruits-nuts');
  }

  // 2. Verify all 4 authoritative products
  const expectedProducts = [
    { _id: '66f000000000000000000011', slug: 'almonds-roasted-500g', sku: 'SKU-ALM-500G' },
    { _id: '66f000000000000000000012', slug: 'pistachios-saffron-250g', sku: 'SKU-PIS-250G' },
    { _id: '66f000000000000000000013', slug: 'pine-nuts-chilgoza-250g', sku: 'SKU-CHIL-250G' },
    { _id: '66f000000000000000000014', slug: 'walnut-kernels-special-500g', sku: 'SKU-WAL-500G' },
  ];

  for (const ep of expectedProducts) {
    const found = inventory.products.find((p) => p._id === ep._id);
    if (!found) {
      errors.push(`Product ${ep._id} missing from manifest products`);
    } else {
      if (found.slug !== ep.slug) errors.push(`Product ${ep._id} slug expected ${ep.slug}, got ${found.slug}`);
      if (found.sku !== ep.sku) errors.push(`Product ${ep._id} SKU expected ${ep.sku}, got ${found.sku}`);
    }
  }

  // 3. Verify all 6 authoritative users
  const expectedUsers = [
    { _id: '66f000000000000000000021', email: 'customer-pk-cod@mevapur.test', role: 'customer' },
    { _id: '66f000000000000000000022', email: 'customer-pk-prepaid@mevapur.test', role: 'customer' },
    { _id: '66f000000000000000000023', email: 'customer-ae-disabled@mevapur.test', role: 'customer' },
    { _id: '66f000000000000000000024', email: 'customer-gb-disabled@mevapur.test', role: 'customer' },
    { _id: '66f000000000000000000025', email: 'admin-uat@mevapur.test', role: 'admin' },
    { _id: '66f000000000000000000026', email: 'support-uat@mevapur.test', role: 'support' },
  ];

  for (const eu of expectedUsers) {
    const found = inventory.users.find((u) => u._id === eu._id);
    if (!found) {
      errors.push(`User ${eu._id} missing from manifest users`);
    } else {
      if (found.email !== eu.email) errors.push(`User ${eu._id} email expected ${eu.email}, got ${found.email}`);
      if (found.role !== eu.role) errors.push(`User ${eu._id} role expected ${eu.role}, got ${found.role}`);
    }
  }

  // 4. Verify orders
  const deliveredOrder = inventory.orders.find((o) => o._id === '66f000000000000000000044');
  if (!deliveredOrder || deliveredOrder.orderId !== 'ORD-UAT-DELIVERED-004') {
    errors.push('Order 66f000000000000000000044 must have orderId ORD-UAT-DELIVERED-004');
  }

  // 5. Verify evidence harness references
  if (fs.existsSync(harnessPath)) {
    const harnessContent = fs.readFileSync(harnessPath, 'utf8');
    if (!harnessContent.includes('almonds-roasted-500g')) {
      errors.push('Evidence harness must reference almonds-roasted-500g');
    }
    if (!harnessContent.includes('pine-nuts-chilgoza-250g')) {
      errors.push('Evidence harness must reference pine-nuts-chilgoza-250g');
    }
    if (!harnessContent.includes('ORD-UAT-DELIVERED-004')) {
      errors.push('Evidence harness must reference ORD-UAT-DELIVERED-004');
    }
    if (!harnessContent.includes('66f000000000000000000044')) {
      errors.push('Evidence harness must reference invoice order ObjectId 66f000000000000000000044');
    }
  }

  // 6. Verify documentation references
  if (fs.existsSync(docPath)) {
    const docContent = fs.readFileSync(docPath, 'utf8');
    if (docContent.includes('California Almonds')) {
      errors.push('Evidence doc contains stale product name "California Almonds"; must be "Almonds Roasted 500g"');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Manifest Fact Reconciliation Failures:\n- ${errors.join('\n- ')}`);
  }
}

function main() {
  console.log('Generating deterministic UAT fixture inventory from authoritative manifest...');
  const inventory = generateInventory();
  validateManifestFacts(inventory);

  const jsonContent = JSON.stringify(inventory, null, 2);
  fs.writeFileSync(inventoryPath, jsonContent, 'utf8');

  const sha256 = crypto.createHash('sha256').update(jsonContent).digest('hex');
  console.log('Manifest inventory generated successfully:');
  console.log(`- Path: ${inventoryPath}`);
  console.log(`- Collections: ${inventory.collectionNames.length}`);
  console.log(`- Total Deterministic IDs: ${inventory.allDeterministicIds.length}`);
  console.log(`- SHA-256: ${sha256}`);
  console.log('All manifest facts validated against code and documentation.');

  return { inventory, sha256 };
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('Manifest reconciliation validation failed:', err.message);
    process.exit(1);
  }
}

module.exports = { generateInventory, validateManifestFacts, main };
