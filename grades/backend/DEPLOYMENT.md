# تشغيل خدمات رصد درجات يسير — مسار نشر خالٍ من المفاتيح الثابتة

**الحالة:** كود النشر جاهز. لا تُعد الخدمات منشورة إلا بعد نجاح تشغيل workflow على GitHub والتحقق من Firebase Console والتجارب.

## المشروع المعروف
- GitHub: `i-SAEED7/yasir-learning-profile`
- Firebase Project ID (كما في إعدادات المشروع): `yasir-learning-profile`
- Cloud Functions (الجيل الثاني): `me-central2` (الدمام)
- لوحة الرصد المحمية: `https://i-saeed7.github.io/yasir-learning-profile/grades/secure/`
- سير العمل اليدوي: `.github/workflows/yasir-deploy-firebase.yml`

## المتطلبات الأولية (مرة واحدة)
1. الحصول على اعتماد الجهة التعليمية لمعالجة وتخزين البيانات الفعلية خارج أنظمة الوزارة. احرص على عدم إدخال أسماء أو درجات حقيقية قبل ذلك.
2. في Firebase Console افتح المشروع `yasir-learning-profile` وتحقق من ملكيته. فعّل Cloud Firestore في المنطقة المعتمدة إداريًا (تدعم الخدمة `me-central2`) **بعد التأكد من متطلبات مكان إقامة البيانات**. فعّل Firebase Authentication لتسجيل الدخول بالرمز عبر Custom Token، ثم انتقل إلى خطة الفوترة المناسبة لخدمات Cloud Functions الجيل الثاني إن كانت مطلوبة.
3. في Google Cloud / Secret Manager، أنشئ السرَّين **YASIR_ADMIN_PIN** (رمز إداري قوي وطويل لا يُشارك) و **YASIR_PIN_PEPPER** (قيمة عشوائية مستقلة) في مشروع Firebase. **لا تضع القيم داخل GitHub أو المحادثة.** تأكد من صلاحية الهوية التشغيلية للدوال للوصول إلى الأسرار.
4. أنشئ Google Cloud Workload Identity Pool + OIDC Provider خاصًا بـ GitHub Actions، وقيّد الثقة بمستودع `i-SAEED7/yasir-learning-profile` وفرع `refs/heads/main` فقط. اربط ذلك بحساب خدمة نشر ذي أقل صلاحيات ممكنة لنشر Cloud Functions وقواعد Firestore. يُوصى بـ WIF بدل ملف مفتاح JSON ثابت.
5. أضف في GitHub Repository → Settings → Secrets and variables → Actions → Variables:
   - `FIREBASE_WIF_PROVIDER`: مسار موفر Workload Identity الكامل `projects/PROJECT_NUMBER/locations/global/workloadIdentityPools/POOL/providers/PROVIDER`
   - `FIREBASE_DEPLOYER_SA`: البريد الخاص بحساب خدمة النشر فقط.
   هذه مُعرّفات عامة وليست أسرارًا.
6. في GitHub Actions افتح `Yasir Grades - Deploy Firebase Backend` ثم اختر **Run workflow** من فرع `main`؛ النشر **يدوي** ولا يعمل تلقائيًا.
7. افحص نتائج النشر: Cloud Functions يجب أن تتضمن `loginWithPin`, `loadPortal`, `saveGrade`, `upsertStudent`, `removeStudent`, `upsertGroup`, `disableGroup`, `setLocks`, `exportGrades`, `logoutPortal`. تأكد من أن قواعد `firestore.rules` منشورة وتمنع الوصول المباشر.
8. اختبر ببيانات **وهمية فقط** من جهازين: إنشاء مجموعة رياضيات 1/1–1/4 وأخرى 1/5–1/8، الدخول لكل رمز، حجب الفصل الآخر، حفظ درجة، فتح/إغلاق فترة، منع التعديل بعد الإغلاق، وتصدير ملف Excel ثم إعادة تسجيل الدخول.
9. راجع سجل العمليات والنسخ الاحتياطي والتعامل مع توافر الإنترنت قبل توزيع الرابط على المعلمين.

## الأمان
- واجهة GitHub Pages ليست قاعدة بيانات؛ صلاحيات المعلم والمنسق تُحسم على الخادم عند كل عملية.
- لا تشغّل `grades/index.html` ببيانات فعلية؛ إنها واجهة تجريبية تحفظ البيانات في الذاكرة وتعرض رموز اختبار.
- لا تعطّل فحص Firestore Rules ولا تنشر أسرار الدخول في المتصفح.
- صلاحية GitHub Actions للنشر تحتاج تفويضًا في Google Cloud. تثبيت إضافة Firebase في ChatGPT وحده لا يساوي تفويض GitHub Actions.
- قبل إطلاق استخدام فعلي يجب اختبار اختراق الصلاحيات، ومراقبة التكاليف، وتأكيد الإجراءات والسياسات المعتمدة للبيانات الطلابية.

## مراجع رسمية
- [Firebase CLI](https://firebase.google.com/docs/cli)
- [Firebase Functions Secrets](https://firebase.google.com/docs/functions/config-env)
- [Firebase Functions Regions](https://firebase.google.com/docs/functions/locations)
- [Workload Identity GitHub Auth](https://github.com/google-github-actions/auth#readme)
