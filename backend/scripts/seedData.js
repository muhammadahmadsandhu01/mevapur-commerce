const mongoose = require('mongoose');
const dotenv = require('dotenv');
const slugify = require('slugify');
const Category = require('../models/Category');
const Brand = require('../models/Brand');

// Load environment variables
dotenv.config();

// ⚠️ 4. MONGODB_URI check
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI is missing in .env file');
  process.exit(1);
}

// ⚠️ 2. Production safety check
if (process.env.NODE_ENV === 'production') {
  console.error('❌ Seeder cannot be run in production environment!');
  process.exit(1);
}

// ⚠️ 6. Rich Category Objects (Enterprise Level)
const categoriesData = [
  {
    name: 'Dry Fruits',
    slug: 'dry-fruits',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=400',
    description: 'Premium quality organic dry fruits sourced directly from farms.',
    isFeatured: true,
    displayOrder: 1,
    subcategories: [
      { name: 'Almonds', slug: 'almonds', displayOrder: 1, isFeatured: true },
      { name: 'Cashews', slug: 'cashews', displayOrder: 2, isFeatured: false },
      { name: 'Walnuts', slug: 'walnuts', displayOrder: 3, isFeatured: true },
      { name: 'Pistachios', slug: 'pistachios', displayOrder: 4, isFeatured: false },
      { name: 'Mixed Dry Fruits', slug: 'mixed-dry-fruits', displayOrder: 5, isFeatured: true }
    ]
  },
  {
    name: 'Dried Fruits',
    slug: 'dried-fruits',
    image: 'https://images.unsplash.com/photo-1601379766822-1c8b2879074f?w=400',
    description: 'Naturally dried fruits with no added sugar or preservatives.',
    isFeatured: true,
    displayOrder: 2,
    subcategories: [
      { name: 'Dates', slug: 'dates', displayOrder: 1, isFeatured: true },
      { name: 'Raisins', slug: 'raisins', displayOrder: 2, isFeatured: false },
      { name: 'Figs', slug: 'figs', displayOrder: 3, isFeatured: false }
    ]
  },
  {
    name: 'Seeds',
    slug: 'seeds',
    image: 'https://images.unsplash.com/photo-1599599810769-bcde5a160d32?w=400',
    description: 'Nutrient-dense seeds for a healthy lifestyle.',
    isFeatured: false,
    displayOrder: 3,
    subcategories: [
      { name: 'Chia Seeds', slug: 'chia-seeds', displayOrder: 1, isFeatured: true },
      { name: 'Pumpkin Seeds', slug: 'pumpkin-seeds', displayOrder: 2, isFeatured: false },
      { name: 'Flax Seeds', slug: 'flax-seeds', displayOrder: 3, isFeatured: false }
    ]
  },
  {
    name: 'Spices & Herbs',
    slug: 'spices-herbs',
    image: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=400',
    description: 'Authentic, aromatic spices for your kitchen.',
    isFeatured: true,
    displayOrder: 4,
    subcategories: [
      { name: 'Turmeric', slug: 'turmeric', displayOrder: 1, isFeatured: false },
      { name: 'Black Pepper', slug: 'black-pepper', displayOrder: 2, isFeatured: false },
      { name: 'Cinnamon', slug: 'cinnamon', displayOrder: 3, isFeatured: true }
    ]
  },
  {
    name: 'Organic Foods',
    slug: 'organic-foods',
    image: 'https://images.unsplash.com/photo-1587049352846-4a222e773a0e?w=400',
    description: '100% certified organic groceries and essentials.',
    isFeatured: true,
    displayOrder: 5,
    subcategories: [
      { name: 'Organic Honey', slug: 'organic-honey', displayOrder: 1, isFeatured: true },
      { name: 'Organic Rice', slug: 'organic-rice', displayOrder: 2, isFeatured: false }
    ]
  }
];

// Brands Data
const brandsData = [
  { name: 'MevaPur', slug: 'mevapur', countryOfOrigin: 'Pakistan', isFeatured: true, displayOrder: 1 },
  { name: 'Organic Valley', slug: 'organic-valley', countryOfOrigin: 'USA', isFeatured: true, displayOrder: 2 },
  { name: 'Premium Nuts', slug: 'premium-nuts', countryOfOrigin: 'Pakistan', isFeatured: false, displayOrder: 3 },
  { name: "Nature's Best", slug: 'natures-best', countryOfOrigin: 'USA', isFeatured: true, displayOrder: 4 },
  { name: 'Golden Harvest', slug: 'golden-harvest', countryOfOrigin: 'Pakistan', isFeatured: false, displayOrder: 5 }
];

const seedData = async () => {
  let session;
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // ⚠️ 7. Start Transaction Session
    session = await mongoose.startSession();
    session.startTransaction();
    console.log('🔄 Started database transaction...');

    // ⚠️ 2. Safe deletion (only in development)
    await Category.deleteMany({}, { session });
    await Brand.deleteMany({}, { session });
    console.log('🧹 Cleared existing categories and brands');

    // ⚠️ 8 & 9. Prepare data for insertMany with detailed logging
    const categoriesToInsert = [];
    const subcategoriesToInsert = [];

    for (const cat of categoriesData) {
      // ⚠️ 5. Safe slug generation for main category
      const mainSlug = cat.slug || slugify(cat.name, { lower: true, strict: true });
      
      const mainCategoryDoc = {
        name: cat.name,
        slug: mainSlug,
        image: cat.image,
        description: cat.description,
        isFeatured: cat.isFeatured,
        displayOrder: cat.displayOrder,
        parentId: null,
        isActive: true
      };
      categoriesToInsert.push(mainCategoryDoc);
      console.log(`  ✔ Main Category: ${cat.name}`);

      // Process subcategories
      for (const sub of cat.subcategories) {
        const subSlug = sub.slug || slugify(sub.name, { lower: true, strict: true });
        subcategoriesToInsert.push({
          name: sub.name,
          slug: subSlug,
          parentId: null, // Will be updated after main categories are inserted
          displayOrder: sub.displayOrder,
          isFeatured: sub.isFeatured,
          isActive: true
        });
        console.log(`    ↳ Subcategory: ${sub.name}`);
      }
    }

    // ⚠️ 8. Use insertMany for performance
    const insertedCategories = await Category.insertMany(categoriesToInsert, { session });
    
    // Link subcategories to their parent main categories
    let subIndex = 0;
    for (const cat of categoriesData) {
      const mainCat = insertedCategories.find(c => c.slug === (cat.slug || slugify(cat.name, { lower: true, strict: true })));
      for (let i = 0; i < cat.subcategories.length; i++) {
        subcategoriesToInsert[subIndex].parentId = mainCat._id;
        subIndex++;
      }
    }

    await Category.insertMany(subcategoriesToInsert, { session });
    console.log('✅ Categories & Subcategories inserted successfully!');

    // Insert Brands
    const brandsToInsert = brandsData.map(b => ({
      ...b,
      slug: b.slug || slugify(b.name, { lower: true, strict: true }),
      isActive: true
    }));
    
    await Brand.insertMany(brandsToInsert, { session });
    console.log('✅ Brands inserted successfully!');

    // ⚠️ 7. Commit Transaction
    await session.commitTransaction();
    console.log('💾 Transaction committed successfully!');

    console.log('\n🎉 ==========================================');
    console.log('🎉 SEEDING COMPLETED SUCCESSFULLY!');
    console.log(`📊 Total Main Categories: ${insertedCategories.length}`);
    console.log(`📊 Total Subcategories: ${subcategoriesToInsert.length}`);
    console.log(`📊 Total Brands: ${brandsToInsert.length}`);
    console.log('🎉 ==========================================\n');

  } catch (error) {
    console.error('❌ Error seeding data:', error.message);
    
    // ⚠️ 7. Abort transaction on error
    if (session) {
      await session.abortTransaction();
      console.log('🔄 Transaction aborted due to error.');
    }
    process.exit(1);
  } finally {
    // ⚠️ 3. Properly disconnect database
    if (session) session.endSession();
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
    process.exit(0);
  }
};

seedData();