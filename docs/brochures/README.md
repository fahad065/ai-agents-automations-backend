# Service brochures

One HTML source per service; render to PDF with headless Chromium:

```bash
node -e "const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();await p.goto('file://'+process.argv[1]);await p.pdf({path:process.argv[2],format:'A4',printBackground:true,preferCSSPageSize:true});await b.close()})()" "$PWD/docs/brochures/restaurant-chatbot.html" LogicMate-Restaurant-Chatbot-Overview.pdf
```

Upload the PDF from admin → Service Catalog → (service) → Edit → Basic tab →
**Brochure → Upload** (stored in Cloudflare R2, saved at once). The service
page then shows a "Download brochure" button next to "Watch demo".

Keep prices and features identical to the service's admin Pricing tab — the
brochure and the website must never disagree.

| Service | Source | Prices in brochure (monthly / annual per month) |
|---|---|---|
| Restaurant chatbot | restaurant-chatbot.html | Basic $79 / $49 · Pro $120 / $99 |
| Gym chatbot | gym-chatbot.html | Basic $79 / $49 · Pro $120 / $99 |
| Spa & Salon chatbot | spa-salon-chatbot.html | Basic $99 / $79 · Pro $149 / $119 |
