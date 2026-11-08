/**
 * One-time migration: merges the `pages` and `blogposts` collections into
 * one `cms` collection (type-discriminated), per
 * ai/architecture.md.
 *
 * Run once, by hand, after reading the output carefully. Needs
 * MONGODB_URI in the environment — this repo has no `dotenv` dependency
 * to auto-load a .env file, so pass it explicitly:
 *   MONGODB_URI="$(grep ^MONGODB_URI= .env | cut -d= -f2-)" node scripts/migrate-cms.js
 * or just export it in your shell first, or run against whichever
 * database the value in .env/Railway points at.
 *
 * Safe to re-run — upserts by {slug, type}, so re-running after a partial
 * failure just re-syncs rather than duplicating. Does NOT delete `pages`/
 * `blogposts` — that's a separate, manual step once the new `cms`
 * collection is verified correct and the app is reading from it in
 * production.
 */
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set. Aborting — refusing to guess a connection string.');
  process.exit(1);
}

async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to', mongoose.connection.name);

  const db = mongoose.connection.db;
  const pagesCol = db.collection('pages');
  const blogCol = db.collection('blogposts');
  const cmsCol = db.collection('cms');

  const pages = await pagesCol.find({}).toArray();
  const posts = await blogCol.find({}).toArray();

  console.log(`Found ${pages.length} pages, ${posts.length} blog posts.`);

  let pagesWritten = 0;
  let postsWritten = 0;
  const errors = [];

  for (const p of pages) {
    try {
      const doc = {
        type: 'page',
        slug: p.slug,
        title: p.title,
        title_ar: p.title_ar,
        content: p.content,
        content_ar: p.content_ar,
        metaTitle: p.metaTitle,
        metaTitle_ar: p.metaTitle_ar,
        metaDescription: p.metaDescription,
        metaDescription_ar: p.metaDescription_ar,
        status: p.isPublished === false ? 'inactive' : 'active',
        isDeleted: false,
        pageMeta: {
          subtitle: p.subtitle,
          subtitle_ar: p.subtitle_ar,
          faqItems: p.faqItems || [],
          faqItems_ar: p.faqItems_ar || [],
          teamMembers: p.teamMembers || [],
          contactInfo: p.contactInfo || undefined,
        },
        lastEditedBy: p.lastEditedBy,
        createdAt: p.createdAt || new Date(),
        updatedAt: p.updatedAt || new Date(),
      };
      await cmsCol.updateOne(
        { slug: doc.slug, type: 'page' },
        { $set: doc },
        { upsert: true },
      );
      pagesWritten++;
    } catch (err) {
      errors.push({ kind: 'page', slug: p.slug, error: err.message });
    }
  }

  for (const b of posts) {
    try {
      const doc = {
        type: 'blog',
        slug: b.slug,
        title: b.title,
        title_ar: b.title_ar,
        content: b.content,
        content_ar: b.content_ar,
        metaTitle: b.metaTitle,
        metaDescription: b.metaDescription,
        status: b.isPublished === false ? 'inactive' : 'active',
        isDeleted: false,
        blogMeta: {
          excerpt: b.excerpt,
          excerpt_ar: b.excerpt_ar,
          authorId: b.authorId,
          authorName: b.authorName,
          category: b.category || 'product',
          tags: b.tags || [],
          coverImage: b.coverImage,
          publishedAt: b.publishedAt,
          readTimeMinutes: b.readTimeMinutes || 0,
          viewCount: b.viewCount || 0,
        },
        createdAt: b.createdAt || new Date(),
        updatedAt: b.updatedAt || new Date(),
      };
      await cmsCol.updateOne(
        { slug: doc.slug, type: 'blog' },
        { $set: doc },
        { upsert: true },
      );
      postsWritten++;
    } catch (err) {
      errors.push({ kind: 'blog', slug: b.slug, error: err.message });
    }
  }

  const cmsCount = await cmsCol.countDocuments();

  console.log('\n--- Migration summary ---');
  console.log(`Pages:   ${pagesWritten}/${pages.length} written`);
  console.log(`Blog:    ${postsWritten}/${posts.length} written`);
  console.log(`cms collection now has ${cmsCount} documents total.`);
  if (errors.length) {
    console.log(`\n${errors.length} error(s):`);
    for (const e of errors) console.log(' -', e.kind, e.slug, '→', e.error);
  } else {
    console.log('\nNo errors.');
  }
  console.log('\nSpot-check a few documents by hand before trusting this blindly:');
  console.log("  db.cms.findOne({type:'page', slug:'about'})");
  console.log("  db.cms.find({type:'blog'}).limit(3)");

  await mongoose.disconnect();
  process.exit(errors.length ? 1 : 0);
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
