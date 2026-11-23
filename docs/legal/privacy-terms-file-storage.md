# Privacy Policy + Terms: file storage sections (draft, EN + AR)

Draft for the owner to paste into **Admin → CMS → Pages** (`privacy`, `terms`),
English into `content`, Arabic into `content_ar`. Written from what the code
does today (2026-11-23). **Have a lawyer review before publishing**; UAE PDPL,
Kenya's Data Protection Act and, for EU/UK customers, GDPR all apply.

Check before pasting:
- The list of service providers in section 1 matches what you actually use.
- The invoice retention period (written as "at least five years") matches what
  your accountant advises for the UAE.
- Contact email: hello@logicmate.io.

Not mentioned on purpose: bucket names, folder layout, which provider holds
which bucket internally. That is internal setup and only helps attackers.

---

## 1. Privacy Policy — new section (English)

Paste as a new section, e.g. after "What information we collect".

```html
<h2>How we store your files</h2>
<p>When you use LogicMate you may upload files, and we create some files for you. This section explains where they are kept, who can see them, and when they are deleted.</p>

<h3>Private files</h3>
<p>These files are visible only to you and to authorised LogicMate staff who need them to support your account:</p>
<ul>
  <li>Documents you upload in your profile, such as an Emirates ID, passport or trade licence.</li>
  <li>Invoices we issue to you.</li>
</ul>
<p>Private files are never publicly accessible. When you open one, we create a secure link that expires after five minutes.</p>

<h3>Files shown to the public</h3>
<p>Photos and brochures you add to your chatbot's knowledge base are shown to visitors who chat with your chatbot on your website, so anyone with the link can open them. Please do not add anything to your knowledge base that you would not publish on your own website.</p>

<h3>Where your files are kept</h3>
<p>Files are stored with Cloudflare, Inc., our file storage provider, and are encrypted while stored and while being transferred. Cloudflare and our other service providers may store or process data in data centres outside your country. Our main service providers are:</p>
<ul>
  <li>Cloudflare — file storage</li>
  <li>MongoDB Atlas — database</li>
  <li>Railway and Vercel — application hosting</li>
  <li>Resend — sending emails</li>
  <li>Sentry — error monitoring</li>
</ul>
<p>Messages your website visitors send to your chatbot are processed by the AI provider you choose (for example OpenAI, Anthropic or Google), using your own API key, under that provider's terms.</p>
<p>We only share data with these providers so they can run the service for us, and we require them to protect it.</p>

<h3>When files are deleted</h3>
<ul>
  <li>A document or knowledge-base file is deleted from storage when you remove it, delete the knowledge entry, or delete the chatbot.</li>
  <li>When you delete your account, we delete your documents, your chatbots and all of their files.</li>
  <li>Invoices and payment records are kept after your account is deleted, for as long as the law requires us to keep accounting records (at least five years). They are not used for anything else.</li>
</ul>
<p>You can download a copy of your data at any time from your dashboard (Settings → Security → Download My Data), or contact us at <a href="mailto:hello@logicmate.io">hello@logicmate.io</a>.</p>
```

## 2. Privacy Policy — new section (Arabic, `content_ar`)

```html
<h2>كيف نحفظ ملفاتك</h2>
<p>لما تستخدم LogicMate ممكن ترفع ملفات، وإحنا بعد نسوي لك بعض الملفات. هذا القسم يوضّح وين نحفظها، ومنو يقدر يشوفها، ومتى تنحذف.</p>

<h3>الملفات الخاصة</h3>
<p>هذي الملفات تشوفها إنت بس، وموظفين LogicMate المخوّلين اللي يحتاجونها عشان يساعدونك في حسابك:</p>
<ul>
  <li>المستندات اللي ترفعها في ملفك الشخصي، مثل الهوية الإماراتية أو الجواز أو الرخصة التجارية.</li>
  <li>الفواتير اللي نصدرها لك.</li>
</ul>
<p>الملفات الخاصة ما تكون متاحة للعامة أبداً. ولما تفتح أي ملف منها، نسوي لك رابط آمن ينتهي بعد خمس دقايق.</p>

<h3>الملفات اللي تظهر للعامة</h3>
<p>الصور والبروشورات اللي تضيفها لقاعدة معرفة الشات بوت حقك تظهر للزوار اللي يكلمون الشات بوت في موقعك، يعني أي حد عنده الرابط يقدر يفتحها. لا تضيف لقاعدة المعرفة أي شي ما تنشره في موقعك.</p>

<h3>وين تنحفظ ملفاتك</h3>
<p>الملفات تنحفظ عند شركة Cloudflare, Inc.، مزوّد التخزين حقنا، وتكون مشفّرة وهي محفوظة ووهي تنتقل. Cloudflare وباقي مزوّدي الخدمة حقنا ممكن يحفظون أو يعالجون البيانات في مراكز بيانات برّا دولتك. مزوّدي الخدمة الرئيسيين:</p>
<ul>
  <li>Cloudflare — تخزين الملفات</li>
  <li>MongoDB Atlas — قاعدة البيانات</li>
  <li>Railway و Vercel — استضافة المنصة</li>
  <li>Resend — إرسال الإيميلات</li>
  <li>Sentry — متابعة الأخطاء</li>
</ul>
<p>الرسايل اللي يرسلها زوار موقعك للشات بوت يعالجها مزوّد الذكاء الاصطناعي اللي تختاره (مثل OpenAI أو Anthropic أو Google)، بمفتاح API حقك، وحسب شروط هذا المزوّد.</p>
<p>ما نشارك البيانات مع هالمزوّدين إلا عشان يشغّلون الخدمة لنا، ونطلب منهم يحمونها.</p>

<h3>متى تنحذف الملفات</h3>
<ul>
  <li>المستند أو ملف قاعدة المعرفة ينحذف من التخزين لما تشيله، أو تحذف المعلومة، أو تحذف الشات بوت.</li>
  <li>لما تحذف حسابك، نحذف مستنداتك والشات بوتات حقتك وكل ملفاتها.</li>
  <li>الفواتير وسجلات الدفع نحتفظ فيها بعد حذف الحساب، للمدة اللي يفرضها القانون لحفظ السجلات المحاسبية (خمس سنين على الأقل)، وما نستخدمها لأي شي ثاني.</li>
</ul>
<p>تقدر تحمّل نسخة من بياناتك في أي وقت من لوحة التحكم (الإعدادات ← الأمان ← Download My Data)، أو تتواصل ويانا على <a href="mailto:hello@logicmate.io">hello@logicmate.io</a>.</p>
```

## 3. Terms & Conditions — new clause (English)

Paste as a new section, e.g. under "Your content" / "Customer responsibilities".

```html
<h2>Files and content you upload</h2>
<ol>
  <li><strong>Knowledge-base files are public.</strong> Photos, brochures and other content you add to your chatbot's knowledge base are shown to anyone who chats with your chatbot and can be opened by anyone with the link.</li>
  <li><strong>Your responsibility.</strong> You confirm you own, or have permission to use, everything you upload, and that publishing it does not break any law or anyone else's rights.</li>
  <li><strong>No sensitive personal data in the knowledge base.</strong> Do not upload other people's personal or confidential information to your knowledge base, such as patient records, ID documents or customer lists.</li>
  <li><strong>Profile documents.</strong> Documents you upload to your profile (for example an ID or trade licence) are kept private and used only to verify and support your account.</li>
  <li><strong>Limits.</strong> We may limit the size, type and number of files you can upload, depending on your plan.</li>
  <li><strong>Removal.</strong> We may remove any file that breaks these Terms or the law, or that we are asked to remove by a competent authority.</li>
  <li><strong>Deletion.</strong> Files are deleted when you remove them, delete the chatbot, or delete your account. Invoices and payment records are kept as described in our Privacy Policy.</li>
</ol>
```

## 4. Terms & Conditions — new clause (Arabic, `content_ar`)

```html
<h2>الملفات والمحتوى اللي ترفعه</h2>
<ol>
  <li><strong>ملفات قاعدة المعرفة عامة.</strong> الصور والبروشورات وأي محتوى تضيفه لقاعدة معرفة الشات بوت يظهر لأي حد يكلّم الشات بوت، وأي حد عنده الرابط يقدر يفتحه.</li>
  <li><strong>مسؤوليتك.</strong> إنت تأكد إنك مالك كل شي ترفعه أو عندك إذن تستخدمه، وإن نشره ما يخالف أي قانون أو حقوق أي حد.</li>
  <li><strong>لا بيانات شخصية حساسة في قاعدة المعرفة.</strong> لا ترفع لقاعدة المعرفة معلومات شخصية أو سرّية عن غيرك، مثل ملفات المرضى أو الهويات أو قوايم العملاء.</li>
  <li><strong>مستندات الملف الشخصي.</strong> المستندات اللي ترفعها في ملفك الشخصي (مثل الهوية أو الرخصة التجارية) تبقى خاصة، ونستخدمها بس عشان نتحقق من حسابك ونساعدك فيه.</li>
  <li><strong>الحدود.</strong> ممكن نحدد حجم ونوع وعدد الملفات اللي تقدر ترفعها حسب باقتك.</li>
  <li><strong>الإزالة.</strong> ممكن نشيل أي ملف يخالف هذي الشروط أو القانون، أو تطلب جهة مختصة إزالته.</li>
  <li><strong>الحذف.</strong> الملفات تنحذف لما تشيلها، أو تحذف الشات بوت، أو تحذف حسابك. الفواتير وسجلات الدفع نحتفظ فيها مثل ما هو موضّح في سياسة الخصوصية.</li>
</ol>
```

## 5. Cookie Policy, brochures, marketing pages

No change. File storage sets no cookies, and brochures/marketing pages don't
need storage details.
