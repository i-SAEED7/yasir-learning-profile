# مهمة إكمال النشر داخل Codex — Firebase Spark (من دون فوترة)

هذا المستودع يحتوي حلًا مجانيًا كامل الشيفرة في `grades/spark/`، وقد اجتازت قواعده اختبارات Firebase Emulator في GitHub Actions.

## القيود غير القابلة للتجاوز
- ممنوع الترقية إلى Blaze أو ربط حساب فوترة.
- ممنوع نشر Cloud Functions أو استخدام Firebase Admin SDK في الإنتاج.
- ممنوع إدخال أسماء أو درجات طلاب حقيقيين أو إرسال كلمات مرور في المحادثة.
- تجنب تغيير أي تطبيق آخر يشترك مع نفس Firebase Project.
- راجع Firebase Console أولًا؛ إذا كانت قاعدة Firestore الحالية مستخدمة في تطبيق آخر، توقف قبل تعديل قواعدها.

## المطلوب تنفيذه داخل Firebase Console
1. تحقّق من أن مشروع `yasir-learning-profile` على Spark.
2. فعّل Authentication → Email/Password إن لم يكن مفعّلًا.
3. تأكّد من وجود Firestore Database افتراضية. إذا لم تكن موجودة، أنشئها في موقع تخزين معتمد من المستخدم والجهة. لا تنشئ قاعدة مدفوعة إضافية.
4. راجع قواعد البيانات الحالية؛ إن كانت القاعدة مخصصة لهذه البوابة انشر قواعد `grades/spark/firestore.rules`، وإلا ادمجها بأمان دون المساس بالقواعد القديمة واحصل على الموافقة اللازمة.
5. اطلب من المستخدم إنشاء حساب المنسق بشكل آمن عبر Authentication → Users؛ لا تنسخ كلمة مروره إلى المحادثة. ثم أنشئ في Firestore المستند `ys_admins/{authUserUid}` بالحقول `active: true` (boolean).
6. افتح `https://i-saeed7.github.io/yasir-learning-profile/grades/`، وجرّب الدخول، إضافة طالب وهمي، إنشاء مجموعة ورمز خاص بها، فتح شاشة المعلم في نافذة ثانية، رصد درجة وتعديلها، قفل التقييم، وتصدير CSV إلى Excel.
7. لا تعلن جاهزية النظام لبيانات طلاب حقيقية إلا بعد اعتماد الجهة واختبار الصلاحيات من أجهزة مختلفة.

## التحقق
- `grades/spark/README.md` شرح كامل.
- `grades/spark/rules.test.mjs` اختبارات صلاحيات فعلية داخل Firestore Emulator.
- `grades/spark/preflight.test.mjs` اختبارات تجنّب الخدمات المدفوعة.
- `.github/workflows/yasir-preflight.yml` يختبر الكود وقواعده.
