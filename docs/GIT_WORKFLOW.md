# طريقة العمل على Git

## الفروع

`main`

النسخة المستقرة. لا نشتغل عليه مباشرة.

`develop`

هنا ندمج كل الشغل المنتهي.

`feature/US-04-file-upload`

فرع لكل كرت. ينشأ من develop. الشكل: feature ثم رقم الكرت ثم اسم قصير.

## خطوات العمل على كرت

```bash
# 1. Get the latest develop and create your branch
git checkout develop
git pull origin develop
git checkout -b feature/US-04-file-upload

# 2. Work, then commit (start the message with the card number)
git add .
git commit -m "US-04: add file size validation"

# 3. Push your branch
git push -u origin feature/US-04-file-upload
```

بعدها افتح Pull Request من فرعك إلى develop. عنوان الطلب يبدأ برقم الكرت.

## المراجعة والدمج

شخص واحد فقط يراجع الكود.

بعد أن يراجع ويوافق (Approve)، يستطيع الدمج.

لا أحد يدمج طلبه بنفسه.

لا دفع مباشر على main أو develop.

## من develop إلى main

في نهاية كل سبرنت نفتح Pull Request واحد من develop إلى main. يراجعه شخص واحد ثم يدمج.
