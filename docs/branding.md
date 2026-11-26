# SEIKO TAILORS branding

The application name is **SEIKO TAILORS**. Jinam remains the assistant's name.

The approved full logo is `public/brands/seiko-logo-approved.webp` (large initial S). Documents use its background-compatible `seiko-logo-document.svg` rendition. Do not substitute the old thin-letter `seiko-logo.png` or `seiko-logo-transparent.png` assets.

Favicons, installation icons and the access-screen mark use the approved logo's collar motif: deep navy, gold and cream. Their editable sources are `public/favicon.svg` and `public/app-icon.svg`; PNG variants provide browser and mobile compatibility. The app uses the Seiko theme rather than the old black Jinam monogram identity.

Keep metadata, web manifest, touch icons and service-worker asset versions aligned when changing application identity.

Keep the manifest link stable at `/manifest.webmanifest?v=5`; the explicit app ID `/` matches the original root start URL. Increment icon asset URLs when changing identity. Chrome may ask users to review name/icon changes in its app menu. Settings → App & Updates exposes installation and a user-triggered reload; normal releases remain shared with the Cloudflare URL, with no forced mid-entry reload.
The collar artwork fills more of the icon canvas and has no background. PNG exports retain alpha; the manifest uses ordinary icons so an enlarged glyph is not advertised as safe for maskable cropping.
