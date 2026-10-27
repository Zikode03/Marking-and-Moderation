# Landing page

The one-screen landing page uses forest-green typography, consistent buttons, four feature summaries and school, college and university sign-in cards. It has no bottom banner, marked-paper widget or Pricing link.

## Background image

The hero and sign-in photo use `public/images/assessment-marking-hero.webp`, generated with the built-in image generation tool. The image shows handwritten scripts, a memorandum, circled answer regions and a tablet with an illustrative document-review display. It represents the marking and moderation workflow without a generic person-at-a-laptop scene. The left side provides space for readable page copy. The image is illustrative, not a screenshot or evidence of a trained marking model. See [HERO_IMAGE_PROMPT.md](HERO_IMAGE_PROMPT.md) for the exact prompt.

Campus photos are illustrative Unsplash assets:
- school-campus.jpg: https://images.unsplash.com/photo-1498243691581-b145c3f54a5a
- college-campus.jpg: https://images.unsplash.com/photo-1562774053-701939374585
- university-campus.jpg: https://images.unsplash.com/photo-1541339907198-e08756dedf3f

## Actions

Get started, Sign in and education cards open staff sign-in. Existing sector, academic pathway, account and invitation flows remain intact. Product, Solutions, About and Resources open distinct information dialogs. Resources provides the video, written workflow and downloadable guide. Contact sales submits to the backend mail service; live email requires backend SMTP configuration. See [SALES_EMAIL_SETUP.md](SALES_EMAIL_SETUP.md).

How it works plays a silent, captioned 30-second H.264 walkthrough using six five-second demonstration scenes. Closing the player stops and resets playback. It states that AI marking requires a trained and validated model.

Responsive landing layouts condense supporting detail to fit one viewport. Dialogs may scroll to retain accessible forms and content.
