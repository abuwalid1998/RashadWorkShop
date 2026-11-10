# تثبيت «ورشة رشاد» على جهاز العميل

لا يحتاج الجهاز إلى أي برنامج آخر: لا PHP ولا MySQL ولا إنترنت.

## التثبيت (ويندوز 10 / 11)

1. نزّل الملف **`RashadWorkshop-Setup-2.0.1.exe`** وشغّله.
2. إذا ظهرت رسالة «Windows protected your PC» اضغط **More info** ثم **Run anyway**
   (تظهر لأن البرنامج غير موقّع رقمياً).
3. اضغط **Install**. يُنشأ اختصار «Rashad Workshop» على سطح المكتب.

بديل بدون تثبيت: الملف **`RashadWorkshop-Portable-2.0.1.exe`** يعمل مباشرة بالنقر عليه.

## نقل البيانات من النظام القديم (مرة واحدة)

1. شغّل MySQL من XAMPP على الجهاز القديم كالمعتاد.
2. افتح البرنامج ← **الإعدادات** ← **الاستيراد من النظام السابق (MySQL)**.
3. اترك القيم كما هي (`localhost` · `3306` · `root` · كلمة مرور فارغة · `carworkshop`)
   واضغط **استيراد من خادم MySQL**.

إذا كان النظام القديم على جهاز آخر: صدّر قاعدة البيانات من phpMyAdmin (Export ← SQL)،
انقل الملف، ثم اضغط **استيراد من ملف SQL**.

بعد الاستيراد يمكن إيقاف XAMPP نهائياً.

## بعد التثبيت

- **الإعدادات ← بيانات الورشة**: اسم الورشة والهاتف والعنوان (تظهر على كشوف الحساب).
- **الإعدادات ← النسخ الاحتياطي اليومي**: اختر مجلداً (يفضّل قرصاً خارجياً أو مجلد
  مزامنة). تُحفظ نسخة كل يوم الساعة 8 مساءً.

---

**English:** run `RashadWorkshop-Setup-2.0.1.exe` (choose *More info → Run anyway* on the
SmartScreen prompt), or use the portable exe with no installation. Import the old data
once from *Settings → Import from the previous system*, then pick a daily-backup folder in
Settings. Nothing else needs to be installed.
