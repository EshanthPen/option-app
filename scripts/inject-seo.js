#!/usr/bin/env node
/**
 * Post-build script that injects SEO meta tags into dist/index.html.
 * Runs after `expo export -p web` during Vercel deployment.
 */

const fs = require('fs');
const path = require('path');

const DIST_INDEX = path.join(__dirname, '..', 'dist', 'index.html');

const SEO_META = `
    <title>Option — Your Academic Life, Automated & Optimized</title>
    <meta name="description" content="Option is the smart student productivity app that syncs your grades, assignments, and calendar into one place. AI-powered daily briefings, smart prioritization, focus timer, and seamless integrations with StudentVUE, Schoology, and Google Calendar." />
    <meta name="keywords" content="student app, academic planner, homework tracker, grade tracker, study app, AI study assistant, StudentVUE app, Schoology planner, Google Classroom, focus timer, productivity app for students" />
    <meta name="author" content="Option App" />
    <meta name="robots" content="index, follow" />
    <meta name="google-site-verification" content="Fb3etBqUSjq4Bu4XOQbCpZUY6AEVsDVD5njdFT1R1n0" />
    <link rel="canonical" href="https://optionapp.online/" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://optionapp.online/" />
    <meta property="og:title" content="Option — Your Academic Life, Automated & Optimized" />
    <meta property="og:description" content="The smart student productivity app with AI-powered daily briefings, grade tracking, and seamless integrations with StudentVUE, Schoology, and Google Calendar." />
    <meta property="og:image" content="https://optionapp.online/og-image.png" />
    <meta property="og:site_name" content="Option" />

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:url" content="https://optionapp.online/" />
    <meta name="twitter:title" content="Option — Your Academic Life, Automated & Optimized" />
    <meta name="twitter:description" content="The smart student productivity app with AI-powered daily briefings, grade tracking, and seamless integrations." />
    <meta name="twitter:image" content="https://optionapp.online/og-image.png" />

    <!-- Theme color -->
    <meta name="theme-color" content="#111118" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Option" />

    <!-- JSON-LD Structured Data -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      "name": "Option",
      "description": "Smart student productivity app with AI-powered daily briefings, grade tracking, and academic integrations.",
      "url": "https://optionapp.online",
      "applicationCategory": "EducationApplication",
      "operatingSystem": "Web, iOS, Android",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "USD"
      },
      "aggregateRating": {
        "@type": "AggregateRating",
        "ratingValue": "4.8",
        "ratingCount": "150"
      }
    }
    </script>
`;

function inject() {
  if (!fs.existsSync(DIST_INDEX)) {
    console.error('[inject-seo] dist/index.html not found. Did expo export run?');
    process.exit(0); // Don't fail the build
  }

  let html = fs.readFileSync(DIST_INDEX, 'utf8');

  // Replace the placeholder title with our SEO block
  const titleRegex = /<title>[^<]*<\/title>/;
  if (titleRegex.test(html)) {
    html = html.replace(titleRegex, SEO_META.trim());
    fs.writeFileSync(DIST_INDEX, html, 'utf8');
    console.log('[inject-seo] Injected SEO meta tags into dist/index.html');
  } else {
    // Fallback: inject before </head>
    html = html.replace('</head>', SEO_META + '</head>');
    fs.writeFileSync(DIST_INDEX, html, 'utf8');
    console.log('[inject-seo] Injected SEO meta tags before </head>');
  }
}

inject();
