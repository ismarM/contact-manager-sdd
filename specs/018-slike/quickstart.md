# Quickstart: preverjanje slik (018)

Predpogoji: JDK 21, Node, Docker. Spremembe so na veji `slike`.

## 1. Hitro (`quick`)
`./verify.sh quick` – enotni testi `ImageProcessor` (JPEG/PNG, orientacije 1–8, metapodatki, CMYK/poškodovano, prevelike dimenzije), `ExifOrientation`, `UrlGuard`, `UploadRateLimiter`; FE: `Avatar`, `useProtectedImage`, `ImageUploadDialog` (MSW, axe).

## 2. Zaledje (`backend`)
`./verify.sh backend` – IT: nalaganje/zamenjava/odstranitev za vse tri vrste, ena slika na lastnika, sprožilca (izbris → obnova priklopi sliko), sled (`photo_change`), obnova in rollback brez spremembe slike, združevanje, kaskadni izbris skupine in računa, izvoz *Moji podatki*, prevzem Google slike z nadomestnim virom; matrika izolacije (401/404/403/2xx, 409 `GROUP_ARCHIVED`, `VERSION_CONFLICT`) za vse poti iz plan.md.

## 3. Sistem (`e2e`)
`./verify.sh e2e` – v pravem vsebniku: naložitev JPEG in PNG (preveri tudi ImageIO v alpine JRE), predogled in obrezovanje s tipkovnico, zamenjava, odstranitev, avatar v seznamih in glavi, bralec brez akcij, zahtevek slike brez žetona (`401`), axe pri 360 in 1280 px, `@w768` za obrezovanje.

## 4. Ročno (razvijalca)
Sprememba vmesnika: ročni preizkus dostopnosti (design.md §10) obrezovalnika in avatarjev; v pravem Firebase (`compose.firebase.yaml`) preizkus gumba *Uporabi sliko Google računa*.

## Pričakovani izidi
Slika brez prijave → `401`; tuja skupina → `404`; datoteka s končnico `.png` z drugo vsebino → `400 INVALID_IMAGE`; shranjena slika brez EXIF/GPS; po izbrisu skupine v `image` ni vrstic skupine.
