<script setup>
import { PRIVACY_POLICY_VERSION } from '../privacy'
</script>

<template>
  <main class="min-h-screen bg-neutral-50 px-4 py-8 text-brand-black" dir="rtl">
    <article class="mx-auto max-w-3xl rounded-2xl bg-brand-white p-5 shadow-sm sm:p-8">
      <RouterLink class="text-sm font-medium text-brand-green hover:underline" to="/login">
        חזרה לאפליקציה
      </RouterLink>
      <h1 class="mt-4 text-3xl font-bold">מדיניות פרטיות</h1>
      <p class="mt-2 text-sm text-neutral-600">גרסה: {{ PRIVACY_POLICY_VERSION }}</p>

      <section class="mt-8 space-y-3 leading-relaxed">
        <h2 class="text-xl font-bold">מי מפעיל את השירות</h2>
        <p>
          השירות Fitness App מופעל בידי גילעד מכלוף, בעל השליטה במידע. לפניות בנושא פרטיות,
          עיון, תיקון או מחיקה ניתן לפנות לכתובת האימייל הפעילה של מפעיל השירות:
          <a class="text-brand-green underline" href="mailto:giladma2006@gmail.com">
            giladma2006@gmail.com
          </a>.
        </p>
      </section>

      <section class="mt-7 space-y-3 leading-relaxed">
        <h2 class="text-xl font-bold">איזה מידע נאסף</h2>
        <ul class="list-disc space-y-2 pe-5">
          <li>פרטי חשבון ויצירת קשר, לרבות שם וכתובת אימייל.</li>
          <li>שיוך בין מתאמן/ת למאמן/ת וסטטוס החשבון.</li>
          <li>תוכניות אימון, ביצועי אימון והודעות הקשורות לשירות.</li>
          <li>יומני תזונה, משקל, יעדים ומדידות שהמשתמש בוחר להזין.</li>
          <li>תמונות התקדמות וסרטוני ביצוע שהמשתמש בוחר להעלות.</li>
          <li>נתוני אבטחה ותפעול מצומצמים הדרושים להתחברות, מניעת שימוש לרעה ותיקון תקלות.</li>
        </ul>
      </section>

      <section class="mt-7 space-y-3 leading-relaxed">
        <h2 class="text-xl font-bold">מסירת מידע והשלכות</h2>
        <p>
          פרטי החשבון, כתובת האימייל והשיוך למאמן נדרשים כדי לפתוח חשבון ולהפעיל את השירות.
          ללא פרטים אלה לא ניתן להשתמש באפליקציה. הזנת משקל, מדידות, יומני תזונה, תמונות
          וסרטונים היא לבחירת המשתמש; ללא הזנתם אפשר להמשיך להשתמש בחשבון, אך התכונות שתלויות
          בהם לא יציגו מעקב או משוב אישי.
        </p>
      </section>

      <section class="mt-7 space-y-3 leading-relaxed">
        <h2 class="text-xl font-bold">מטרות השימוש</h2>
        <p>
          המידע משמש להפעלת החשבון, בניית תוכניות, הצגת התקדמות, תקשורת בין המאמן למתאמן,
          אבטחת המערכת ומתן תמיכה. איננו מוכרים מידע אישי ואיננו משתמשים במידע בריאותי או
          בתכני מתאמנים לצורך פרסום ממוקד.
        </p>
      </section>

      <section class="mt-7 space-y-3 leading-relaxed">
        <h2 class="text-xl font-bold">מי יכול לראות את המידע</h2>
        <p>
          מתאמן יכול לראות את המידע האישי שלו. המאמן המשויך אליו יכול לראות את המידע הדרוש
          למתן השירות. מאמן אינו יכול לראות מידע של מתאמנים השייכים למאמן אחר. חשבון בעל
          המערכת מנהל חשבונות מאמנים ומכסה, ואינו מקבל דרך מסך הניהול גישה לתוכן בריאותי,
          למדידות, לתמונות או לסרטונים של מתאמנים.
        </p>
      </section>

      <section class="mt-7 space-y-3 leading-relaxed">
        <h2 class="text-xl font-bold">ספקים ואחסון</h2>
        <p>
          השירות משתמש ב-Supabase לצורכי התחברות, מסד נתונים ואחסון קבצים, ב-Vercel לאירוח
          האפליקציה וב-Resend לשליחת הודעות מערכת. מידע עשוי להישמר או להיות מעובד מחוץ לישראל
          בהתאם למיקום התשתית של ספקים אלה ולהסכמים שלהם. הגישה מוגבלת לצורך הפעלת השירות.
        </p>
      </section>

      <section class="mt-7 space-y-3 leading-relaxed">
        <h2 class="text-xl font-bold">עוגיות ואמצעי מעקב</h2>
        <p>
          האפליקציה משתמשת באמצעים טכניים חיוניים לשמירת התחברות מאובטחת ולהפעלת השירות. נכון
          לגרסה זו לא מותקנים כלי פרסום, Meta Pixel, Google Analytics או כלי הקלטת מסך. אם
          יתווסף בעתיד כלי מעקב שאינו חיוני, המדיניות תעודכן והוא לא יופעל לפני קבלת הסכמה
          מתאימה.
        </p>
      </section>

      <section class="mt-7 space-y-3 leading-relaxed">
        <h2 class="text-xl font-bold">שמירה, מחיקה וזכויות המשתמש</h2>
        <p>
          המידע נשמר כל עוד החשבון פעיל או כל עוד הוא דרוש למתן השירות, לעמידה בחובה חוקית או
          להגנה מפני שימוש לרעה. ניתן לבקש לעיין במידע, לתקן אותו או למחוק אותו באמצעות כתובת
          הקשר לעיל. בקשת מחיקה עשויה להיות כפופה לשמירה מצומצמת שנדרשת לפי דין, חיוב, אבטחה או
          טיפול במחלוקת. לפני ביצוע בקשה נוודא את זהות המבקש.
        </p>
      </section>

      <section class="mt-7 space-y-3 leading-relaxed">
        <h2 class="text-xl font-bold">אבטחה ושינויים</h2>
        <p>
          אנו מפעילים הפרדת הרשאות בין מאמנים, מתאמנים ובעל המערכת, מגבילים גישה לקבצים לפי
          שיוך החשבון ומצמצמים את המידע המוצג במסכי ניהול. אין מערכת חסינה לחלוטין. במקרה של
          שינוי מהותי במדיניות נציג גרסה ותאריך חדשים ונבקש הסכמה מחודשת כאשר הדבר נדרש.
        </p>
      </section>
    </article>
  </main>
</template>
