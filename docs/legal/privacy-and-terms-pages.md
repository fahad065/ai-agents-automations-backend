# Privacy Policy + Terms of Service: full page content (EN + AR)

For the owner to paste into **Admin → Website Content (CMS) → Pages**. One
block per field. HTML goes into `content` (English) and `content_ar` (Arabic).
Written 2026-11-23 from what the platform does today. Replaces the earlier
partial draft (`privacy-terms-file-storage.md`).

**Before publishing**
- Have a lawyer review both pages (UAE PDPL; Kenya Data Protection Act 2019;
  GDPR/UK GDPR for European customers).
- Confirm the items marked in the checklist at the end (legal entity name,
  governing law, invoice retention period, provider list).
- The "Last updated" date goes in the page subtitle.

---

# PRIVACY POLICY — page `privacy`

| Field | English | Arabic |
|---|---|---|
| Title | Privacy Policy | سياسة الخصوصية |
| Subtitle | Last updated: 23 November 2026 | آخر تحديث: 23 نوفمبر 2026 |
| Meta title | Privacy Policy — LogicMate | سياسة الخصوصية — LogicMate |
| Meta description | How LogicMate collects, uses, stores and protects your data and your customers' data. | كيف تجمع LogicMate بياناتك وبيانات عملائك وتستخدمها وتحفظها وتحميها. |

## Privacy — `content` (English)

```html
<p>LogicMate ("LogicMate", "we", "us") provides ready-made AI chatbots, AI agents and automations for businesses. This policy explains what information we collect, why, how we store and protect it, who we share it with, and the choices you have. It applies to our website logicmate.io, the LogicMate dashboard, and the chatbots businesses run on LogicMate.</p>

<h2>1. Who is responsible for your data</h2>
<ul>
  <li><strong>Your account data.</strong> For the information you give us when you sign up and use LogicMate as a customer, LogicMate is responsible for it (the "controller").</li>
  <li><strong>Your customers' data.</strong> When a business uses a LogicMate chatbot, the messages and contact details its website visitors share belong to that business. The business decides how they are used, and LogicMate processes them only to run the chatbot on the business's behalf (as a "processor"). If you chatted with a business's chatbot and have a question about your data, please contact that business first. We will help them answer you.</li>
</ul>

<h2>2. Information we collect</h2>
<h3>When you create and use an account</h3>
<ul>
  <li><strong>Account details:</strong> your name, email address and password (stored only as a secure hash). If you sign in with Google, we receive your name, email address and profile picture from Google.</li>
  <li><strong>Profile details you choose to add:</strong> such as your phone number, company, country and language.</li>
  <li><strong>Documents you upload</strong> to your profile, such as an Emirates ID, passport or trade licence.</li>
  <li><strong>Your chatbot content:</strong> your business information, knowledge base (questions, answers, links, photos and brochures), branch locations, opening hours and settings.</li>
  <li><strong>API keys</strong> you add for AI providers (for example OpenAI, Anthropic or Google). LogicMate works on a "bring your own key" basis: AI usage is billed to you directly by the provider.</li>
  <li><strong>Connected accounts</strong> you choose to link, such as YouTube, Instagram or a WhatsApp Business number, including the access tokens needed to post or reply on your behalf.</li>
  <li><strong>Billing details:</strong> your plan, the bank-transfer reference you submit, payment status and invoices. We do not collect or store card numbers.</li>
  <li><strong>Usage information:</strong> such as features used, agent and automation runs, chatbot message counts, and a log of important account actions (for security and support).</li>
  <li><strong>Messages you send us</strong> by email or through the website.</li>
</ul>
<h3>When someone chats with a LogicMate chatbot</h3>
<ul>
  <li>The messages exchanged with the chatbot, the channel used (website, WhatsApp or Instagram), and the time.</li>
  <li>Contact details the visitor chooses to share in the chat, such as name, phone number and email, which are passed to the business so it can follow up.</li>
  <li>For WhatsApp and Instagram, the identifiers Meta provides to deliver the message (such as a phone number or account ID).</li>
</ul>
<h3>When you visit our website</h3>
<ul>
  <li>Technical information such as your browser, device and the pages you visit, and error reports if something breaks.</li>
  <li>If you accept analytics cookies, Google Analytics collects anonymous statistics about how the website is used. See section 9.</li>
</ul>

<h2>3. How we use information</h2>
<ul>
  <li>To create and run your account, chatbots, agents and automations.</li>
  <li>To answer your website visitors' questions using your knowledge base and the AI provider you chose.</li>
  <li>To send emails you need: account verification, password resets, setup guides, trial reminders, lead and hand-off alerts, payment confirmations and invoices.</li>
  <li>To verify bank transfers, issue invoices and keep accounting records.</li>
  <li>To provide support, keep the service secure, prevent abuse, and fix errors.</li>
  <li>To understand how the service is used and improve it.</li>
  <li>To meet our legal obligations.</li>
</ul>
<p>We use information on these legal grounds: to provide the service you signed up for (our contract with you), our legitimate interests in running and improving a secure service, your consent (for example analytics cookies, which you can withdraw at any time), and legal obligations (for example keeping accounting records).</p>
<p>We do not sell your personal data, and we do not use your or your customers' data to train AI models.</p>

<h2>4. AI providers and your API keys</h2>
<p>When a chatbot answers a question, or an agent or automation runs, the relevant text (the visitor's message and the matching parts of your knowledge base) is sent to the AI provider you selected, using your own API key. That provider processes it under its own terms and privacy policy. Please review the terms of the provider you choose.</p>
<p>Your API keys are encrypted before they are stored, are never shown again after you save them, and are never written to our logs.</p>

<h2>5. How we store your files</h2>
<h3>Private files</h3>
<p>These files are visible only to you and to authorised LogicMate staff who need them to support your account:</p>
<ul>
  <li>Documents you upload to your profile.</li>
  <li>Invoices we issue to you.</li>
</ul>
<p>Private files are never publicly accessible. When you open one, we create a secure link that expires after five minutes.</p>
<h3>Files shown to the public</h3>
<p>Photos and brochures you add to your chatbot's knowledge base are shown to visitors who chat with your chatbot, so anyone with the link can open them. Please do not add anything to your knowledge base that you would not publish on your own website.</p>

<h2>6. Who we share information with</h2>
<p>We share information only with service providers who help us run LogicMate, and only as much as they need:</p>
<ul>
  <li><strong>Cloudflare</strong> — file storage</li>
  <li><strong>MongoDB Atlas</strong> — database</li>
  <li><strong>Railway</strong> and <strong>Vercel</strong> — application hosting</li>
  <li><strong>Resend</strong> — sending emails</li>
  <li><strong>Sentry</strong> — error monitoring</li>
  <li><strong>Google</strong> — sign-in with Google, YouTube connection, and (only if you accept analytics cookies) Google Analytics</li>
  <li><strong>Meta</strong> — delivering WhatsApp and Instagram messages for chatbots that use those channels</li>
  <li><strong>The AI provider you choose</strong> (such as OpenAI, Anthropic or Google), using your own API key</li>
</ul>
<p>We may also share information if the law requires it, to protect our rights or users' safety, or as part of a merger or sale of the business (in which case this policy will continue to apply).</p>

<h2>7. International transfers</h2>
<p>LogicMate is based in the United Arab Emirates and serves businesses worldwide. Our service providers may store or process data in data centres in other countries, including the United States and the European Union. When data is transferred, we rely on our providers' security measures and contractual safeguards to protect it.</p>

<h2>8. Security</h2>
<ul>
  <li>Data is encrypted in transit (HTTPS) and files are encrypted while stored.</li>
  <li>Passwords are stored as secure hashes; API keys are encrypted.</li>
  <li>Private files open only through short-lived secure links.</li>
  <li>Access to customer data is limited to authorised staff.</li>
  <li>Incoming WhatsApp and Instagram messages are checked with Meta's signature before they are accepted.</li>
</ul>
<p>No system is completely secure. If we become aware of a breach that affects your data, we will tell you and the relevant authorities as the law requires.</p>

<h2>9. Cookies</h2>
<p>We use essential cookies and similar browser storage to keep you signed in and remember your preferences, such as language. These are always on because the service doesn't work without them. Analytics cookies (Google Analytics) are used only if you accept them in the cookie banner, and you can change your choice at any time from the cookie settings link at the bottom of the website. We do not use advertising cookies. See our <a href="/cookies">Cookie Policy</a> for details.</p>

<h2>10. How long we keep information</h2>
<ul>
  <li><strong>Account and chatbot data</strong> is kept while your account is active.</li>
  <li><strong>Chatbot conversations</strong> are kept while the chatbot exists so you can review them, and are deleted when you delete the chatbot or your account.</li>
  <li><strong>Documents and knowledge-base files</strong> are deleted from storage when you remove them, delete the knowledge entry or chatbot, or delete your account.</li>
  <li><strong>When you delete your account</strong>, we delete your profile details, documents, chatbots and all their files, knowledge base, conversations, API keys, subscriptions and notifications. Your account is anonymised.</li>
  <li><strong>Invoices and payment records</strong> are kept after your account is deleted, with your name and contact details removed, for as long as the law requires us to keep accounting records (at least five years). They are not used for anything else.</li>
</ul>

<h2>11. Your rights and choices</h2>
<p>Depending on where you live, you may have the right to access, correct, download, or delete your personal data, to object to or restrict some uses, and to withdraw consent at any time.</p>
<ul>
  <li><strong>Correct</strong> your details in your profile.</li>
  <li><strong>Download</strong> a copy of your data from Settings → Security → Download My Data.</li>
  <li><strong>Delete</strong> your account from Settings → Security. You can delete it instantly, or schedule deletion: your account keeps working, we remind you the day before, and everything is deleted on day 8. You can cancel a scheduled deletion until then.</li>
  <li><strong>Disconnect</strong> YouTube or Instagram from your dashboard at any time. You can also remove LogicMate's access to your Google account at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.</li>
  <li><strong>Cookies:</strong> change your choice from the cookie settings link at the bottom of the website.</li>
</ul>
<p>For any other request, email <a href="mailto:hello@logicmate.io">hello@logicmate.io</a>. We reply within 30 days. You also have the right to complain to your local data protection authority.</p>

<h2>12. YouTube and Google data</h2>
<p>If you connect a YouTube channel, LogicMate uses YouTube API Services to upload videos and read basic channel information for you. By connecting, you agree to the <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">YouTube Terms of Service</a>, and Google's use of data is covered by the <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a>. LogicMate's use of information received from Google APIs follows the Google API Services User Data Policy, including its Limited Use requirements.</p>

<h2>13. Children</h2>
<p>LogicMate is a business service and is not meant for anyone under 18. We do not knowingly collect data from children. Businesses must not use LogicMate chatbots to collect data from children where the law does not allow it.</p>

<h2>14. Changes to this policy</h2>
<p>We may update this policy from time to time. We will change the "Last updated" date above and, for important changes, email you before they take effect.</p>

<h2>15. Contact us</h2>
<p>LogicMate, Dubai, United Arab Emirates<br/>Email: <a href="mailto:hello@logicmate.io">hello@logicmate.io</a></p>
```

## Privacy — `content_ar` (Arabic)

```html
<p>LogicMate (اللي نشير لها بـ"LogicMate" أو "إحنا") تقدّم شات بوتات ووكلاء ذكاء اصطناعي وأتمتة جاهزة للشركات. هذي السياسة توضّح أي معلومات نجمعها وليش، وكيف نحفظها ونحميها، ومع منو نشاركها، وشو الخيارات اللي عندك. وتنطبق على موقعنا logicmate.io، ولوحة تحكم LogicMate، والشات بوتات اللي تشغّلها الشركات على LogicMate.</p>

<h2>1. منو المسؤول عن بياناتك</h2>
<ul>
  <li><strong>بيانات حسابك.</strong> المعلومات اللي تعطينا إياها لما تسجّل وتستخدم LogicMate كعميل، LogicMate هي المسؤولة عنها ("المتحكّم").</li>
  <li><strong>بيانات عملائك.</strong> لما شركة تستخدم شات بوت من LogicMate، الرسايل وبيانات التواصل اللي يشاركها زوار موقعها تخص هالشركة. الشركة هي اللي تقرر كيف تُستخدم، وLogicMate تعالجها بس عشان تشغّل الشات بوت نيابة عنها ("معالج"). إذا كلّمت شات بوت لشركة وعندك سؤال عن بياناتك، تواصل ويا الشركة أول، وإحنا بنساعدهم يردّون عليك.</li>
</ul>

<h2>2. المعلومات اللي نجمعها</h2>
<h3>لما تسوي حساب وتستخدمه</h3>
<ul>
  <li><strong>بيانات الحساب:</strong> اسمك وإيميلك وكلمة المرور (نحفظها بس كـ hash آمن). وإذا دخلت بحساب Google، يوصلنا من Google اسمك وإيميلك وصورتك.</li>
  <li><strong>بيانات الملف الشخصي اللي تختار تضيفها:</strong> مثل رقم تلفونك وشركتك ودولتك ولغتك.</li>
  <li><strong>المستندات اللي ترفعها</strong> في ملفك الشخصي، مثل الهوية الإماراتية أو الجواز أو الرخصة التجارية.</li>
  <li><strong>محتوى الشات بوت حقك:</strong> معلومات شركتك، وقاعدة المعرفة (الأسئلة والأجوبة والروابط والصور والبروشورات)، والفروع، وأوقات الدوام، والإعدادات.</li>
  <li><strong>مفاتيح API</strong> اللي تضيفها لمزوّدي الذكاء الاصطناعي (مثل OpenAI أو Anthropic أو Google). LogicMate تشتغل بنظام "مفتاحك إنت": تكلفة استخدام الذكاء الاصطناعي يحاسبك عليها المزوّد مباشرة.</li>
  <li><strong>الحسابات المربوطة</strong> اللي تختار تربطها، مثل YouTube أو Instagram أو رقم WhatsApp Business، مع رموز الدخول اللازمة عشان ننشر أو نرد نيابة عنك.</li>
  <li><strong>بيانات الفوترة:</strong> باقتك، ورقم مرجع التحويل البنكي اللي ترسله، وحالة الدفع، والفواتير. ما نجمع ولا نحفظ أرقام البطاقات.</li>
  <li><strong>بيانات الاستخدام:</strong> مثل الخصايص اللي تستخدمها، وتشغيلات الوكلاء والأتمتة، وعدد رسايل الشات بوت، وسجل لأهم الإجراءات في الحساب (للأمان والدعم).</li>
  <li><strong>الرسايل اللي ترسلها لنا</strong> بالإيميل أو من الموقع.</li>
</ul>
<h3>لما حد يكلّم شات بوت من LogicMate</h3>
<ul>
  <li>الرسايل اللي تنرسل ويا الشات بوت، والقناة (الموقع أو WhatsApp أو Instagram)، والوقت.</li>
  <li>بيانات التواصل اللي يختار الزائر يشاركها في المحادثة، مثل الاسم ورقم التلفون والإيميل، وتوصل للشركة عشان تتابع وياه.</li>
  <li>في WhatsApp و Instagram، المعرّفات اللي تعطيها Meta عشان توصل الرسالة (مثل رقم التلفون أو رقم الحساب).</li>
</ul>
<h3>لما تزور موقعنا</h3>
<ul>
  <li>معلومات تقنية مثل المتصفح والجهاز والصفحات اللي تزورها، وتقارير الأخطاء إذا صار أي خلل.</li>
  <li>إذا وافقت على ملفات تعريف الارتباط التحليلية، Google Analytics يجمع إحصائيات مجهولة الهوية عن استخدام الموقع. شوف البند 9.</li>
</ul>

<h2>3. كيف نستخدم المعلومات</h2>
<ul>
  <li>عشان نسوي ونشغّل حسابك والشات بوتات والوكلاء والأتمتة.</li>
  <li>عشان نجاوب أسئلة زوار موقعك من قاعدة المعرفة حقك وبمزوّد الذكاء الاصطناعي اللي اخترته.</li>
  <li>عشان نرسل لك الإيميلات اللي تحتاجها: تأكيد الحساب، وإعادة تعيين كلمة المرور، وأدلة الإعداد، وتذكيرات الفترة التجريبية، وتنبيهات العملاء المحتملين وطلبات التواصل ويا فريقك، وتأكيدات الدفع والفواتير.</li>
  <li>عشان نتأكد من التحويلات البنكية، ونصدر الفواتير، ونحفظ السجلات المحاسبية.</li>
  <li>عشان نقدّم الدعم، ونحافظ على أمان الخدمة، ونمنع إساءة الاستخدام، ونصلّح الأخطاء.</li>
  <li>عشان نفهم كيف تُستخدم الخدمة ونطوّرها.</li>
  <li>عشان نلتزم بالقانون.</li>
</ul>
<p>نستخدم المعلومات على هالأسس القانونية: تقديم الخدمة اللي اشتركت فيها (العقد بيننا)، ومصلحتنا المشروعة في تشغيل خدمة آمنة وتطويرها، وموافقتك (مثل ملفات تعريف الارتباط التحليلية، وتقدر تسحب موافقتك في أي وقت)، والالتزامات القانونية (مثل حفظ السجلات المحاسبية).</p>
<p>ما نبيع بياناتك الشخصية، وما نستخدم بياناتك ولا بيانات عملائك عشان ندرّب نماذج ذكاء اصطناعي.</p>

<h2>4. مزوّدي الذكاء الاصطناعي ومفاتيح API حقتك</h2>
<p>لما الشات بوت يجاوب سؤال، أو يشتغل وكيل أو أتمتة، النص المطلوب (رسالة الزائر والأجزاء المناسبة من قاعدة المعرفة حقك) ينرسل لمزوّد الذكاء الاصطناعي اللي اخترته، بمفتاح API حقك. والمزوّد يعالجه حسب شروطه وسياسة الخصوصية حقته، فراجع شروط المزوّد اللي تختاره.</p>
<p>مفاتيح API حقتك تتشفّر قبل ما تنحفظ، وما تنعرض مرة ثانية بعد ما تحفظها، وما تنكتب أبداً في سجلاتنا.</p>

<h2>5. كيف نحفظ ملفاتك</h2>
<h3>الملفات الخاصة</h3>
<p>هذي الملفات تشوفها إنت بس، وموظفين LogicMate المخوّلين اللي يحتاجونها عشان يساعدونك في حسابك:</p>
<ul>
  <li>المستندات اللي ترفعها في ملفك الشخصي.</li>
  <li>الفواتير اللي نصدرها لك.</li>
</ul>
<p>الملفات الخاصة ما تكون متاحة للعامة أبداً. ولما تفتح أي ملف منها، نسوي لك رابط آمن ينتهي بعد خمس دقايق.</p>
<h3>الملفات اللي تظهر للعامة</h3>
<p>الصور والبروشورات اللي تضيفها لقاعدة معرفة الشات بوت حقك تظهر للزوار اللي يكلّمون الشات بوت، يعني أي حد عنده الرابط يقدر يفتحها. لا تضيف لقاعدة المعرفة أي شي ما تنشره في موقعك.</p>

<h2>6. مع منو نشارك المعلومات</h2>
<p>نشارك المعلومات بس ويا مزوّدي الخدمة اللي يساعدونا نشغّل LogicMate، وبس بالقدر اللي يحتاجونه:</p>
<ul>
  <li><strong>Cloudflare</strong> — تخزين الملفات</li>
  <li><strong>MongoDB Atlas</strong> — قاعدة البيانات</li>
  <li><strong>Railway</strong> و <strong>Vercel</strong> — استضافة المنصة</li>
  <li><strong>Resend</strong> — إرسال الإيميلات</li>
  <li><strong>Sentry</strong> — متابعة الأخطاء</li>
  <li><strong>Google</strong> — الدخول بحساب Google، وربط YouTube، و Google Analytics (بس إذا وافقت على ملفات تعريف الارتباط التحليلية)</li>
  <li><strong>Meta</strong> — توصيل رسايل WhatsApp و Instagram للشات بوتات اللي تستخدم هالقنوات</li>
  <li><strong>مزوّد الذكاء الاصطناعي اللي تختاره</strong> (مثل OpenAI أو Anthropic أو Google)، بمفتاح API حقك</li>
</ul>
<p>وممكن نشارك المعلومات إذا طلبها القانون، أو عشان نحمي حقوقنا أو سلامة المستخدمين، أو إذا صار اندماج أو بيع للشركة (وفي هالحالة تظل هذي السياسة سارية).</p>

<h2>7. نقل البيانات خارج الدولة</h2>
<p>LogicMate مقرها في الإمارات العربية المتحدة وتخدم شركات من كل العالم. مزوّدي الخدمة حقنا ممكن يحفظون أو يعالجون البيانات في مراكز بيانات في دول ثانية، منها الولايات المتحدة والاتحاد الأوروبي. ولما تنتقل البيانات، نعتمد على إجراءات الأمان والضمانات التعاقدية عند مزوّدينا عشان نحميها.</p>

<h2>8. الأمان</h2>
<ul>
  <li>البيانات مشفّرة وهي تنتقل (HTTPS)، والملفات مشفّرة وهي محفوظة.</li>
  <li>كلمات المرور محفوظة كـ hash آمن، ومفاتيح API مشفّرة.</li>
  <li>الملفات الخاصة ما تنفتح إلا بروابط آمنة قصيرة المدة.</li>
  <li>الوصول لبيانات العملاء محصور على الموظفين المخوّلين.</li>
  <li>رسايل WhatsApp و Instagram الواردة نتأكد منها بتوقيع Meta قبل ما نقبلها.</li>
</ul>
<p>ما في نظام آمن مية بالمية. وإذا عرفنا بأي اختراق يأثر على بياناتك، بنبلّغك ونبلّغ الجهات المختصة حسب ما يطلب القانون.</p>

<h2>9. ملفات تعريف الارتباط (الكوكيز)</h2>
<p>نستخدم ملفات تعريف ارتباط أساسية وتخزين مشابه في المتصفح عشان نخليك مسجّل دخول ونتذكر تفضيلاتك مثل اللغة. هذي دايماً شغّالة لأن الخدمة ما تشتغل بدونها. ملفات تعريف الارتباط التحليلية (Google Analytics) نستخدمها بس إذا وافقت عليها في شريط الكوكيز، وتقدر تغيّر اختيارك أي وقت من رابط إعدادات الكوكيز تحت في الموقع. وما نستخدم كوكيز إعلانية. شوف <a href="/cookies">سياسة ملفات تعريف الارتباط</a> للتفاصيل.</p>

<h2>10. كم نحتفظ بالمعلومات</h2>
<ul>
  <li><strong>بيانات الحساب والشات بوت</strong> نحتفظ فيها طول ما حسابك شغّال.</li>
  <li><strong>محادثات الشات بوت</strong> نحتفظ فيها طول ما الشات بوت موجود عشان تقدر تراجعها، وتنحذف لما تحذف الشات بوت أو حسابك.</li>
  <li><strong>المستندات وملفات قاعدة المعرفة</strong> تنحذف من التخزين لما تشيلها، أو تحذف المعلومة أو الشات بوت، أو تحذف حسابك.</li>
  <li><strong>لما تحذف حسابك</strong>، نحذف بيانات ملفك الشخصي، ومستنداتك، والشات بوتات وكل ملفاتها، وقاعدة المعرفة، والمحادثات، ومفاتيح API، والاشتراكات، والإشعارات، ونخلي حسابك مجهول الهوية.</li>
  <li><strong>الفواتير وسجلات الدفع</strong> نحتفظ فيها بعد حذف الحساب، بعد ما نشيل منها اسمك وبيانات تواصلك، للمدة اللي يفرضها القانون لحفظ السجلات المحاسبية (خمس سنين على الأقل)، وما نستخدمها لأي شي ثاني.</li>
</ul>

<h2>11. حقوقك وخياراتك</h2>
<p>حسب مكان إقامتك، ممكن يكون لك الحق تطّلع على بياناتك الشخصية أو تصححها أو تحمّلها أو تحذفها، وتعترض على بعض الاستخدامات أو تقيّدها، وتسحب موافقتك في أي وقت.</p>
<ul>
  <li><strong>التصحيح:</strong> عدّل بياناتك من ملفك الشخصي.</li>
  <li><strong>التحميل:</strong> حمّل نسخة من بياناتك من الإعدادات ← الأمان ← Download My Data.</li>
  <li><strong>الحذف:</strong> احذف حسابك من الإعدادات ← الأمان. تقدر تحذفه على طول، أو تجدول الحذف: حسابك يظل شغّال، نذكّرك قبلها بيوم، وكل شي ينحذف في اليوم الثامن. وتقدر تلغي الحذف المجدول قبل هالموعد.</li>
  <li><strong>فك الربط:</strong> افصل YouTube أو Instagram من لوحة التحكم في أي وقت. وتقدر بعد تشيل صلاحية LogicMate من حساب Google حقك من <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.</li>
  <li><strong>الكوكيز:</strong> غيّر اختيارك من رابط إعدادات الكوكيز تحت في الموقع.</li>
</ul>
<p>لأي طلب ثاني، راسلنا على <a href="mailto:hello@logicmate.io">hello@logicmate.io</a> ونرد خلال 30 يوم. ولك الحق بعد تقدّم شكوى لجهة حماية البيانات في بلدك.</p>

<h2>12. بيانات YouTube و Google</h2>
<p>إذا ربطت قناة YouTube، LogicMate تستخدم خدمات YouTube API عشان ترفع الفيديوهات وتقرأ معلومات القناة الأساسية نيابة عنك. ولما تربط، إنت توافق على <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer">شروط خدمة YouTube</a>، واستخدام Google للبيانات تغطيه <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">سياسة خصوصية Google</a>. واستخدام LogicMate للمعلومات اللي توصلها من Google APIs يلتزم بسياسة بيانات مستخدمي خدمات Google API، ومنها شروط الاستخدام المحدود (Limited Use).</p>

<h2>13. الأطفال</h2>
<p>LogicMate خدمة للشركات، وما هي لأي حد عمره أقل من 18 سنة. وما نجمع بيانات الأطفال عن قصد. وما يحق للشركات تستخدم شات بوتات LogicMate عشان تجمع بيانات أطفال إذا القانون ما يسمح.</p>

<h2>14. التغييرات على هذي السياسة</h2>
<p>ممكن نحدّث هذي السياسة من وقت لوقت. بنغيّر تاريخ "آخر تحديث" فوق، وإذا كان التغيير مهم بنرسل لك إيميل قبل ما يبدأ.</p>

<h2>15. تواصل ويانا</h2>
<p>LogicMate، دبي، الإمارات العربية المتحدة<br/>الإيميل: <a href="mailto:hello@logicmate.io">hello@logicmate.io</a></p>
```

---

# TERMS OF SERVICE — page `terms`

| Field | English | Arabic |
|---|---|---|
| Title | Terms of Service | شروط الخدمة |
| Subtitle | Last updated: 23 November 2026 | آخر تحديث: 23 نوفمبر 2026 |
| Meta title | Terms of Service — LogicMate | شروط الخدمة — LogicMate |
| Meta description | The terms that apply when you use LogicMate's chatbots, AI agents and automations. | الشروط اللي تنطبق لما تستخدم شات بوتات ووكلاء وأتمتة LogicMate. |

## Terms — `content` (English)

```html
<p>These Terms of Service ("Terms") are an agreement between you and LogicMate ("LogicMate", "we", "us") and apply to your use of logicmate.io, the LogicMate dashboard, and every chatbot, AI agent and automation we provide (the "Service"). By creating an account or using the Service, you agree to these Terms and to our <a href="/privacy">Privacy Policy</a>. If you use the Service for a company, you confirm you are allowed to accept these Terms for it.</p>

<h2>1. The Service</h2>
<p>LogicMate is a marketplace of ready-made AI services for businesses:</p>
<ul>
  <li><strong>Chatbots</strong> that answer your customers on your website and, on plans that include them, on WhatsApp and Instagram, using the knowledge base you provide.</li>
  <li><strong>AI agents and automations</strong> that create content and run business workflows for you.</li>
</ul>
<p>Features available to you depend on the service and plan you choose (for example, Basic or Pro for chatbots). We may improve, change or remove features over time. If we remove a major feature you pay for, we will tell you in advance.</p>

<h2>2. Your account</h2>
<ul>
  <li>You must be at least 18 years old and give accurate information.</li>
  <li>Keep your login details safe. You are responsible for everything that happens in your account.</li>
  <li>Tell us straight away at <a href="mailto:hello@logicmate.io">hello@logicmate.io</a> if you think your account has been used without your permission.</li>
  <li>Our team may set up or configure services for you at your request (for example building your chatbot or connecting WhatsApp). Anything we set up for you remains your responsibility once it is live.</li>
</ul>

<h2>3. Your own AI keys ("bring your own key")</h2>
<p>LogicMate does not provide or pay for AI usage. Each service uses the API keys you add for your chosen AI provider (for example OpenAI, Anthropic or Google), and that provider bills you directly under its own terms. Some services also need other third-party accounts (for example YouTube, Instagram, a WhatsApp Business number or a Meta app).</p>
<ul>
  <li>You are responsible for your accounts with those providers, their costs, limits and terms.</li>
  <li>If a key is missing, invalid or out of credit, the affected service will not work until you fix it. This does not pause or reduce your LogicMate fees.</li>
  <li>LogicMate is not responsible for third-party outages, price changes or decisions (for example Meta's review of your app or a provider suspending your key).</li>
</ul>

<h2>4. Free trial</h2>
<p>New subscriptions start with a 30-day free trial. Near the end we remind you by email. If you don't pay when the trial ends, the service stops working (for example, your chatbot stops answering) until payment is confirmed. Nothing is charged automatically.</p>

<h2>5. Prices, payment and invoices</h2>
<ul>
  <li>Prices are shown on the service page or agreed with you in writing, monthly or annually. Fees are paid in advance.</li>
  <li>We currently accept <strong>bank transfer</strong>. After you transfer the money, submit the transfer reference in your dashboard. Your subscription becomes active when our team confirms the payment, and we then email you a numbered invoice, which you can also download from your Billing tab.</li>
  <li>Renewals are not automatic: you choose when to pay for the next period. If a renewal isn't paid, the service stops working until it is.</li>
  <li>You can request an upgrade (for example Basic to Pro) from your dashboard. It takes effect when the payment is confirmed.</li>
  <li>Prices do not include taxes unless stated. If VAT or other taxes apply, they will be shown on your invoice.</li>
  <li>We may change prices for future periods. We will tell you at least 30 days before a change affects you.</li>
</ul>

<h2>6. Cancellation and refunds</h2>
<p>You can cancel at any time by contacting <a href="mailto:hello@logicmate.io">hello@logicmate.io</a>. Cancellation takes effect at the end of the period you have already paid for, and you keep access until then. Refunds are covered by our <a href="/refund">Refund Policy</a>, including the 7-day money-back guarantee for first-time subscribers.</p>

<h2>7. Your content and your customers</h2>
<ol>
  <li><strong>You own your content.</strong> Everything you add (business information, knowledge base, photos, brochures, prompts, documents) stays yours. You give LogicMate permission to store, process and display it only to provide the Service to you.</li>
  <li><strong>Knowledge-base files are public.</strong> Photos, brochures and other content in your chatbot's knowledge base are shown to anyone who chats with your chatbot and can be opened by anyone with the link.</li>
  <li><strong>You are responsible for your content.</strong> You confirm you own it or have permission to use it, that it is accurate, and that publishing it does not break any law or anyone's rights (including copyright, trademarks and advertising rules).</li>
  <li><strong>No sensitive personal data in the knowledge base.</strong> Do not add other people's personal or confidential information, such as patient records, ID documents or customer lists.</li>
  <li><strong>Your customers' data.</strong> Messages and contact details your website visitors share with your chatbot belong to you. You are responsible for having a privacy notice on your website, for any consent your law requires, and for how you use the leads you receive. LogicMate processes this data only to run the Service for you, as described in our Privacy Policy.</li>
  <li><strong>Profile documents</strong> (for example an ID or trade licence) are kept private and used only to verify and support your account.</li>
  <li><strong>Limits.</strong> We may limit the size, type and number of files you upload, and the message volume, depending on your plan.</li>
  <li><strong>Removal.</strong> We may remove content that breaks these Terms or the law, or that a competent authority asks us to remove.</li>
</ol>

<h2>8. AI answers and generated content</h2>
<ul>
  <li>AI can make mistakes. Chatbots are instructed to answer only from your knowledge base, but you should check your knowledge base is complete and accurate, review your conversations regularly, and not rely on the chatbot for medical, legal, financial or emergency advice.</li>
  <li>Where your chatbot cannot answer, it shows your fallback message and, if you turn it on, offers hand-off to your team. You are responsible for following up.</li>
  <li>You are responsible for reviewing content our agents and automations create, and for following the rules of the platforms you publish to (for example YouTube and Instagram), including their rules on AI-generated content.</li>
</ul>

<h2>9. Acceptable use</h2>
<p>You must not use LogicMate to:</p>
<ul>
  <li>Break any law, or help anyone else to.</li>
  <li>Send spam, unsolicited bulk messages, or misleading, deceptive or fraudulent content.</li>
  <li>Publish anything harmful, hateful, sexually explicit, or that infringes someone else's rights.</li>
  <li>Collect personal data unlawfully, or collect data from children where the law doesn't allow it.</li>
  <li>Break the rules of WhatsApp, Instagram, Meta, YouTube, Google or your AI provider.</li>
  <li>Try to hack, overload, reverse-engineer or get around the security or limits of the Service.</li>
  <li>Resell or share the Service with others without our written permission.</li>
</ul>

<h2>10. Our property</h2>
<p>LogicMate's software, designs, templates, brand and website belong to LogicMate. You may use them only as part of the Service while your subscription is active. If you send us feedback, we may use it without any obligation to you.</p>

<h2>11. Suspension and ending the agreement</h2>
<ul>
  <li>We may suspend or close your account if you break these Terms, don't pay, or if we must to protect the Service, other users or to follow the law. Where reasonable, we will warn you first.</li>
  <li>You can stop using the Service at any time. You can deactivate your account, or delete it from Settings → Security: instantly, or scheduled (your account keeps working, we remind you the day before, and everything is deleted on day 8; you can cancel until then). Download your data first from Settings → Security → Download My Data; deleted data cannot be recovered.</li>
  <li>After your account is deleted, we keep invoices and payment records (anonymised) as our Privacy Policy explains.</li>
</ul>

<h2>12. Availability</h2>
<p>We work hard to keep LogicMate running, but we do not promise it will always be available, uninterrupted or error-free. We may pause it for maintenance, and it depends on third-party services we do not control.</p>

<h2>13. Disclaimer</h2>
<p>Apart from what these Terms expressly say, the Service is provided "as is" and "as available", without warranties of any kind, to the extent the law allows.</p>

<h2>14. Limitation of liability</h2>
<p>To the extent the law allows: LogicMate is not liable for indirect or consequential losses, lost profits, lost business or lost data, or for losses caused by AI-generated answers or content, third-party services, or your content. Our total liability for any claim relating to the Service is limited to the fees you paid us in the 3 months before the claim. Nothing in these Terms limits liability that cannot be limited by law.</p>

<h2>15. Indemnity</h2>
<p>You agree to cover LogicMate's reasonable losses and costs from claims by others arising from your content, your use of the Service, your customers' data, or your breach of these Terms.</p>

<h2>16. Changes to these Terms</h2>
<p>We may update these Terms. We will change the "Last updated" date above and, for important changes, email you at least 14 days before they take effect. If you keep using the Service after that, the new Terms apply. If you don't agree, you can cancel as described in section 6.</p>

<h2>17. Governing law</h2>
<p>These Terms are governed by the laws of the Emirate of Dubai and the federal laws of the United Arab Emirates. The courts of Dubai have jurisdiction over any dispute, unless the law where you live gives you a right to bring a claim there.</p>

<h2>18. General</h2>
<p>If any part of these Terms can't be enforced, the rest still applies. If we don't enforce a right straight away, we don't give it up. You may not transfer your account to someone else without our permission. These Terms, the Privacy Policy, the Refund Policy and the Cookie Policy are the whole agreement between us about the Service. If the English and Arabic versions differ, the English version applies.</p>

<h2>19. Contact us</h2>
<p>LogicMate, Dubai, United Arab Emirates<br/>Email: <a href="mailto:hello@logicmate.io">hello@logicmate.io</a></p>
```

## Terms — `content_ar` (Arabic)

```html
<p>شروط الخدمة هذي ("الشروط") اتفاق بينك وبين LogicMate (اللي نشير لها بـ"LogicMate" أو "إحنا")، وتنطبق على استخدامك لـ logicmate.io ولوحة تحكم LogicMate وكل شات بوت ووكيل ذكاء اصطناعي وأتمتة نقدّمها ("الخدمة"). لما تسوي حساب أو تستخدم الخدمة، إنت توافق على هذي الشروط وعلى <a href="/privacy">سياسة الخصوصية</a>. وإذا تستخدم الخدمة لشركة، إنت تأكد إنك مخوّل توافق على هذي الشروط عنها.</p>

<h2>1. الخدمة</h2>
<p>LogicMate سوق لخدمات ذكاء اصطناعي جاهزة للشركات:</p>
<ul>
  <li><strong>شات بوتات</strong> ترد على عملائك في موقعك، وفي الباقات اللي تشملها، على WhatsApp و Instagram، من قاعدة المعرفة اللي تعطينا إياها.</li>
  <li><strong>وكلاء ذكاء اصطناعي وأتمتة</strong> تسوي لك محتوى وتشغّل مهام شغلك.</li>
</ul>
<p>الخصايص المتاحة لك تعتمد على الخدمة والباقة اللي تختارها (مثل Basic أو Pro للشات بوتات). وممكن نطوّر الخصايص أو نغيّرها أو نشيلها مع الوقت. وإذا شلنا خاصية رئيسية إنت دافع عليها، بنبلّغك قبلها.</p>

<h2>2. حسابك</h2>
<ul>
  <li>لازم يكون عمرك 18 سنة أو أكثر، وتعطي معلومات صحيحة.</li>
  <li>حافظ على بيانات الدخول حقتك. إنت مسؤول عن كل شي يصير في حسابك.</li>
  <li>بلّغنا على طول على <a href="mailto:hello@logicmate.io">hello@logicmate.io</a> إذا تحس إن حد استخدم حسابك بدون إذنك.</li>
  <li>فريقنا ممكن يجهّز أو يضبط لك الخدمات إذا طلبت (مثل إنه يسوي الشات بوت حقك أو يربط WhatsApp). وأي شي نجهّزه لك يصير مسؤوليتك من لحظة ما يشتغل.</li>
</ul>

<h2>3. مفاتيح الذكاء الاصطناعي حقتك ("مفتاحك إنت")</h2>
<p>LogicMate ما توفّر ولا تدفع تكلفة استخدام الذكاء الاصطناعي. كل خدمة تستخدم مفاتيح API اللي تضيفها لمزوّد الذكاء الاصطناعي اللي تختاره (مثل OpenAI أو Anthropic أو Google)، والمزوّد يحاسبك مباشرة حسب شروطه. وبعض الخدمات تحتاج بعد حسابات ثانية (مثل YouTube أو Instagram أو رقم WhatsApp Business أو تطبيق Meta).</p>
<ul>
  <li>إنت مسؤول عن حساباتك عند هالمزوّدين، وتكاليفها، وحدودها، وشروطها.</li>
  <li>إذا المفتاح ناقص أو غلط أو خلص رصيده، الخدمة المتأثرة ما بتشتغل لين تصلّحه، وهذا ما يوقف ولا ينقّص رسوم LogicMate.</li>
  <li>LogicMate مب مسؤولة عن أعطال المزوّدين الثانيين أو تغيير أسعارهم أو قراراتهم (مثل مراجعة Meta لتطبيقك أو إيقاف المزوّد لمفتاحك).</li>
</ul>

<h2>4. الفترة التجريبية المجانية</h2>
<p>الاشتراكات الجديدة تبدأ بفترة تجريبية مجانية 30 يوم. وقرب نهايتها نذكّرك بالإيميل. وإذا ما دفعت لما تخلص الفترة التجريبية، الخدمة توقف (مثلاً الشات بوت يوقف يرد) لين نأكد الدفع. وما ينخصم منك أي مبلغ تلقائياً.</p>

<h2>5. الأسعار والدفع والفواتير</h2>
<ul>
  <li>الأسعار موضّحة في صفحة الخدمة أو متفق عليها وياك كتابياً، شهري أو سنوي. والرسوم تندفع مقدّماً.</li>
  <li>حالياً نقبل <strong>التحويل البنكي</strong>. بعد ما تحوّل المبلغ، أرسل رقم مرجع التحويل من لوحة التحكم. اشتراكك يتفعّل لما فريقنا يأكد الدفع، وبعدها نرسل لك فاتورة مرقّمة بالإيميل، وتقدر بعد تحمّلها من تبويب الفوترة.</li>
  <li>التجديد مب تلقائي: إنت تختار متى تدفع للفترة الجاية. وإذا التجديد ما اندفع، الخدمة توقف لين يندفع.</li>
  <li>تقدر تطلب ترقية (مثل من Basic إلى Pro) من لوحة التحكم، وتتفعّل لما نأكد الدفع.</li>
  <li>الأسعار ما تشمل الضرايب إلا إذا ذكرنا غير جذي. وإذا انطبقت ضريبة القيمة المضافة أو أي ضريبة ثانية، بتظهر في فاتورتك.</li>
  <li>ممكن نغيّر الأسعار للفترات الجاية، وبنبلّغك قبل 30 يوم على الأقل من أي تغيير يأثر عليك.</li>
</ul>

<h2>6. الإلغاء والاسترداد</h2>
<p>تقدر تلغي في أي وقت بالتواصل ويانا على <a href="mailto:hello@logicmate.io">hello@logicmate.io</a>. الإلغاء يبدأ من نهاية الفترة اللي دافع عليها، ويظل عندك وصول لين ذاك الوقت. والاسترداد تغطيه <a href="/refund">سياسة الاسترداد</a>، ومنها ضمان استرجاع المبلغ خلال 7 أيام للمشتركين لأول مرة.</p>

<h2>7. محتواك وعملاؤك</h2>
<ol>
  <li><strong>محتواك ملكك.</strong> كل شي تضيفه (معلومات شركتك، وقاعدة المعرفة، والصور، والبروشورات، والتعليمات، والمستندات) يظل ملكك. وإنت تعطي LogicMate إذن تحفظه وتعالجه وتعرضه بس عشان تقدّم لك الخدمة.</li>
  <li><strong>ملفات قاعدة المعرفة عامة.</strong> الصور والبروشورات وأي محتوى في قاعدة معرفة الشات بوت يظهر لأي حد يكلّم الشات بوت، وأي حد عنده الرابط يقدر يفتحه.</li>
  <li><strong>إنت مسؤول عن محتواك.</strong> إنت تأكد إنك مالكه أو عندك إذن تستخدمه، وإنه صحيح، وإن نشره ما يخالف أي قانون أو حقوق أي حد (ومنها حقوق النشر والعلامات التجارية وقوانين الإعلان).</li>
  <li><strong>لا بيانات شخصية حساسة في قاعدة المعرفة.</strong> لا تضيف معلومات شخصية أو سرّية عن غيرك، مثل ملفات المرضى أو الهويات أو قوايم العملاء.</li>
  <li><strong>بيانات عملائك.</strong> الرسايل وبيانات التواصل اللي يشاركها زوار موقعك ويا الشات بوت ملكك. وإنت مسؤول تحط سياسة خصوصية في موقعك، وتاخذ أي موافقة يطلبها قانونك، وعن طريقة استخدامك للعملاء المحتملين اللي يوصلونك. وLogicMate تعالج هالبيانات بس عشان تشغّل لك الخدمة، مثل ما هو موضّح في سياسة الخصوصية.</li>
  <li><strong>مستندات الملف الشخصي</strong> (مثل الهوية أو الرخصة التجارية) تبقى خاصة، ونستخدمها بس عشان نتحقق من حسابك ونساعدك فيه.</li>
  <li><strong>الحدود.</strong> ممكن نحدد حجم ونوع وعدد الملفات اللي ترفعها، وعدد الرسايل، حسب باقتك.</li>
  <li><strong>الإزالة.</strong> ممكن نشيل أي محتوى يخالف هذي الشروط أو القانون، أو تطلب جهة مختصة إزالته.</li>
</ol>

<h2>8. أجوبة الذكاء الاصطناعي والمحتوى اللي يسويه</h2>
<ul>
  <li>الذكاء الاصطناعي ممكن يغلط. الشات بوتات مبرمجة ترد بس من قاعدة المعرفة حقتك، بس لازم تتأكد إن قاعدة المعرفة كاملة وصحيحة، وتراجع محادثاتك باستمرار، وما تعتمد على الشات بوت في النصايح الطبية أو القانونية أو المالية أو الحالات الطارئة.</li>
  <li>لما الشات بوت ما يعرف يجاوب، يعرض رسالتك الاحتياطية، وإذا فعّلت الخاصية، يعرض التواصل ويا فريقك. وإنت مسؤول عن المتابعة.</li>
  <li>إنت مسؤول تراجع المحتوى اللي يسويه الوكلاء والأتمتة، وتلتزم بقوانين المنصات اللي تنشر فيها (مثل YouTube و Instagram)، ومنها قوانينهم عن المحتوى المسوّى بالذكاء الاصطناعي.</li>
</ul>

<h2>9. الاستخدام المقبول</h2>
<p>ما يحق لك تستخدم LogicMate عشان:</p>
<ul>
  <li>تخالف أي قانون، أو تساعد غيرك يخالفه.</li>
  <li>ترسل سبام أو رسايل جماعية بدون طلب، أو محتوى مضلّل أو مخادع أو احتيالي.</li>
  <li>تنشر أي شي مؤذي أو يحرّض على الكراهية أو إباحي، أو يتعدى على حقوق غيرك.</li>
  <li>تجمع بيانات شخصية بطريقة غير قانونية، أو تجمع بيانات أطفال إذا القانون ما يسمح.</li>
  <li>تخالف قوانين WhatsApp أو Instagram أو Meta أو YouTube أو Google أو مزوّد الذكاء الاصطناعي حقك.</li>
  <li>تحاول تخترق الخدمة أو تثقّل عليها أو تفكّكها أو تتجاوز حمايتها أو حدودها.</li>
  <li>تعيد بيع الخدمة أو تشاركها ويا غيرك بدون إذن كتابي منا.</li>
</ul>

<h2>10. ملكيتنا</h2>
<p>برامج LogicMate وتصاميمها وقوالبها وعلامتها التجارية وموقعها ملك LogicMate. وتقدر تستخدمها بس كجزء من الخدمة طول ما اشتراكك شغّال. وإذا أرسلت لنا اقتراحات، ممكن نستخدمها بدون أي التزام تجاهك.</p>

<h2>11. الإيقاف وإنهاء الاتفاق</h2>
<ul>
  <li>ممكن نوقف حسابك أو نسكّره إذا خالفت هذي الشروط، أو ما دفعت، أو إذا لزم عشان نحمي الخدمة أو المستخدمين الثانيين أو نلتزم بالقانون. وإذا كان معقول، بننبّهك قبلها.</li>
  <li>تقدر توقف استخدام الخدمة أي وقت. تقدر توقف حسابك، أو تحذفه من الإعدادات ← الأمان: على طول، أو بحذف مجدول (حسابك يظل شغّال، نذكّرك قبلها بيوم، وكل شي ينحذف في اليوم الثامن، وتقدر تلغيه قبل هالموعد). حمّل بياناتك أول من الإعدادات ← الأمان ← Download My Data، لأن البيانات المحذوفة ما ترجع.</li>
  <li>بعد ما ينحذف حسابك، نحتفظ بالفواتير وسجلات الدفع (بدون بياناتك الشخصية) مثل ما توضّح سياسة الخصوصية.</li>
</ul>

<h2>12. توفّر الخدمة</h2>
<p>نشتغل بجهد عشان تظل LogicMate شغّالة، بس ما نضمن إنها بتكون متوفرة دايماً أو بدون انقطاع أو بدون أخطاء. ممكن نوقفها للصيانة، وهي بعد تعتمد على خدمات أطراف ثانية مب تحت سيطرتنا.</p>

<h2>13. إخلاء المسؤولية</h2>
<p>غير اللي تنص عليه هذي الشروط صراحة، الخدمة مقدّمة "كما هي" و"حسب التوفّر"، بدون أي ضمانات، بالقدر اللي يسمح فيه القانون.</p>

<h2>14. حدود المسؤولية</h2>
<p>بالقدر اللي يسمح فيه القانون: LogicMate مب مسؤولة عن الخسائر غير المباشرة أو التبعية، أو خسارة الأرباح أو الأعمال أو البيانات، أو الخسائر اللي يسببها رد أو محتوى من الذكاء الاصطناعي، أو خدمات الأطراف الثانية، أو محتواك. ومسؤوليتنا الكاملة عن أي مطالبة متعلقة بالخدمة ما تتعدى الرسوم اللي دفعتها لنا في الـ 3 شهور اللي قبل المطالبة. ولا شي في هذي الشروط يحدّ من مسؤولية ما يجوز قانونياً تحديدها.</p>

<h2>15. التعويض</h2>
<p>إنت توافق تعوّض LogicMate عن الخسائر والتكاليف المعقولة الناتجة عن مطالبات من غيرك بسبب محتواك، أو استخدامك للخدمة، أو بيانات عملائك، أو مخالفتك لهذي الشروط.</p>

<h2>16. التغييرات على هذي الشروط</h2>
<p>ممكن نحدّث هذي الشروط. بنغيّر تاريخ "آخر تحديث" فوق، وإذا كان التغيير مهم بنرسل لك إيميل قبل 14 يوم على الأقل من بدايته. وإذا استمريت تستخدم الخدمة بعدها، تنطبق الشروط الجديدة. وإذا ما وافقت، تقدر تلغي مثل ما هو موضّح في البند 6.</p>

<h2>17. القانون المطبّق</h2>
<p>هذي الشروط تخضع لقوانين إمارة دبي والقوانين الاتحادية في دولة الإمارات العربية المتحدة. ومحاكم دبي هي المختصة بأي نزاع، إلا إذا كان قانون بلدك يعطيك حق ترفع الدعوى هناك.</p>

<h2>18. أحكام عامة</h2>
<p>إذا أي جزء من هذي الشروط ما يمكن تطبيقه، الباقي يظل ساري. وإذا ما طبّقنا حق على طول، هذا ما يعني إننا تنازلنا عنه. وما يحق لك تنقل حسابك لغيرك بدون إذننا. وهذي الشروط وسياسة الخصوصية وسياسة الاسترداد وسياسة ملفات تعريف الارتباط هي الاتفاق الكامل بيننا عن الخدمة. وإذا صار اختلاف بين النسخة الإنجليزية والعربية، النسخة الإنجليزية هي المعتمدة.</p>

<h2>19. تواصل ويانا</h2>
<p>LogicMate، دبي، الإمارات العربية المتحدة<br/>الإيميل: <a href="mailto:hello@logicmate.io">hello@logicmate.io</a></p>
```

---

## Checklist before publishing

1. **Legal entity.** Both pages say "LogicMate, Dubai". Once the LLC / trade licence exists, put the registered legal name and address in section 15 (Privacy) and section 19 (Terms), and in `billing/invoice-issuer.ts`.
2. **Governing law (Terms §17).** Written as Dubai / UAE law and Dubai courts. Confirm with your lawyer (some companies choose DIFC courts or arbitration instead).
3. **Invoice retention (Privacy §10).** Written as "at least five years". UAE tax records are commonly kept 5 years (longer with VAT registration); confirm with your accountant.
4. **Provider list (Privacy §6).** Matches what the code uses today: Cloudflare, MongoDB Atlas, Railway, Vercel, Resend, Sentry, Google (sign-in, YouTube, Analytics), Meta, the customer's chosen AI provider. Update it if you add or change one.
5. **Cookie Policy page.** Make sure it also says analytics (Google Analytics) runs only after consent, matching Privacy §9.
6. **Refund Policy page.** It still says "All LogicMate subscriptions begin with a 30-day free trial … modules are automatically paused" — that matches; and the 7-day money-back guarantee referenced in Terms §6 is defined there.
7. **Old text replaced.** The current pages still say account deletion is "7 working days" and list only MongoDB Atlas and Vercel as providers; these drafts replace both with what the platform does now (instant or scheduled day-8 deletion; full provider list).
